import { PoolClient } from "pg";
import pool from "~/lib/3rdParty/nodejs-helper/postgres.js";
import { Request } from "express";
import named from 'yesql';
import moment from "moment";
import crypto from 'crypto';
import { create, all } from 'mathjs'
import { logging } from "./logging";

//=====================================================================
//== Enums
//=====================================================================

export enum JoinType {
    JOIN = 'JOIN',
    INNER_JOIN = 'INNER JOIN',
    LEFT_JOIN = 'LEFT JOIN',
    RIGHT_JOIN = 'RIGHT JOIN',
    FULL_JOIN = 'FULL JOIN',
    OUTER_JOIN = 'OUTER JOIN',
    NATURAL_JOIN = 'NATURAL JOIN',
    CROSS_JOIN = 'CROSS JOIN',
    LEFT_OUTER_JOIN = 'LEFT OUTER JOIN',
    RIGHT_OUTER_JOIN = 'RIGHT OUTER JOIN',
    FULL_OUTER_JOIN = 'FULL OUTER JOIN',
}

//=====================================================================
//== Types
//=====================================================================

export type Filter = {
    where: string,
    values?: { [key: string]: any },
}

interface JoinInterface {
    type: JoinType,
    from: string,
    on: string,
}
export class Join {
    type: JoinType;
    from: string;
    on: string;

    constructor ({ type, from, on }: JoinInterface) {
        this.type = type;
        this.from = from;
        this.on = on;
    }

    toQuery () {
        return `${this.type} ${this.from} ON ${this.on}`;
    }
}

export type ValidationType = {
    name: string,
    type: "string" | "number" | "boolean" | "date-time" | "date" | "time" | "id",
    required?: boolean,
    min?: number,
    max?: number,
    pattern?: string,
    allowedChars?: string,
    decimals?: number,
}

//=====================================================================
//== Functions
//=====================================================================

export function outputExecutionTime (fileName: string, functionName: string, executionTime: number) {
    //logging.info(fileName.replace((global as any).appRoot, "~") + ':' + functionName + ' [Execution time]: %dms', executionTime);
}

export function callbackAndReturn (data: any, callback?: ((result: any) => any) | null): any {
    if (callback) callback(data);
    return data
}

export function isDebug () {
    return process.env.NODE_ENV !== 'production';
};

//=====================================================================
//== SQL Helper
//=====================================================================

export interface getParameterFromRequestParams {
    request: Request;
}
export interface getParameterFromRequestResult {
    filter?: Filter[] | { [index: string]: any },
    limit: number | null;
    offset: number | null;
    orderBy: { [x: string]: string; } | null;
    additionalData: { [x: string]: any; } | null;
}
export async function getParameterFromRequest (request: Request): Promise<getParameterFromRequestResult> {
    const filter = typeof request.query.search == "string" ? JSON.parse(request.query.search) : typeof request.query.filter == "string" ? JSON.parse(request.query.filter) : typeof request.query.search == "object" ? request.query.search : typeof request.query.filter == "object" ? request.query.filter : null;
    const limit = typeof request.query.limit == "string" && !Number.isNaN(parseInt(request.query.limit)) ? parseInt(request.query.limit) : null;
    const offset = typeof request.query.offset == "string" && !Number.isNaN(parseInt(request.query.offset)) ? parseInt(request.query.offset) : null;
    let orderBy: string | { [x: string]: string; } | null = typeof request.query.order_by == "string" ? request.query.order_by : typeof request.query.orderBy == "string" ? request.query.orderBy : null;

    // Check if orderBy is a JSON string and parse it
    if (orderBy && typeof orderBy == "string" && orderBy.startsWith('{')) {
        orderBy = JSON.parse(orderBy) as { [x: string]: string; };
    }
    else if (orderBy && typeof orderBy == "string") {
        let newOrderBy: { [x: string]: string; } = {};
        const orderByArray = orderBy.split(',');
        for (let i = 0; i < orderByArray.length; i++) {
            const orderByItem = orderByArray[i];
            const orderByItemArray = orderByItem.split(' ');
            if (orderByItemArray.length == 1) {
                newOrderBy[orderByItemArray[0]] = 'ASC';
            }
            else if (orderByItemArray.length == 2) {
                if (orderByItemArray[1] != 'ASC' && orderByItemArray[1] != 'DESC') {
                    newOrderBy[orderByItemArray[0]] = 'ASC';
                }
                else {
                    newOrderBy[orderByItemArray[0]] = orderByItemArray[1];
                }
            }
        }
        orderBy = newOrderBy;
    }
    else {
        orderBy = null;
    }

    // Check if additional data is provided (every other query parameter)
    let additionalData: { [x: string]: any; } | null = null;
    if (request.query) {
        additionalData = {};
        for (const key in request.query) {
            if (key != 'search' && key != 'filter' && key != 'limit' && key != 'offset' && key != 'order_by' && key != 'orderBy') {
                additionalData[key] = request.query[key];
            }
        }
    }

    return { filter: filter, limit: limit, offset: offset, orderBy: orderBy, additionalData: additionalData };
}

interface PgMapKeyNameInterface {
    key: string,
    mapping: { [index: string]: string } | null,
}
export async function pgMapKeyName ({ key, mapping }: PgMapKeyNameInterface): Promise<string> {
    if (mapping != null && Object.keys(mapping).indexOf(key) >= 0) {
        return mapping[key];
    }
    else if (key.indexOf("-") >= 0) {
        return key.replace("-", "_");
    }
    return key;
}

interface PgSimplePatchInterface {
    scheme: string,
    table: string,
    id?: string | null,
    data: { [index: string]: unknown },
    filter?: Filter[] | { [index: string]: any },
    callback?: ((result: Object) => any) | null,
    client?: PoolClient | null,
    returnData?: boolean,
}
export async function pgSimplePatch ({ scheme, table, data, id = null, filter = [], callback = null, client = null, returnData = false }: PgSimplePatchInterface): Promise<{ [index: string]: any }> {

    // Get function start time
    const start: [number, number] = process.hrtime();

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    // Convert filter map to array
    if (filter != null && typeof filter.length == "undefined") {
        let newFilter: Filter[] = []
        for (let [key, value] of Object.entries(filter)) {
            let id = crypto.randomBytes(20).toString('hex');
            newFilter.push({
                where: `${scheme}.${table}.${key} = :${id}`,
                values: { [id]: value }
            })
        }
        filter = newFilter;
    }

    // Validate data
    if (Object.keys(data).length == 0) {
        logging.warn(`pgSimplePatch: No data provided for ${scheme}.${table}`);
        return callbackAndReturn({ success: true }, callback);
    }

    try {

        // Begin transaction
        if (!client) await _client.query('BEGIN')

        // Remove forbidden keys
        let forbiddenKeys = ['id', 'created_at', 'updated_at'];
        for (let key of forbiddenKeys) {
            if (Object.keys(data).indexOf(key) >= 0) {
                delete data[key];
            }
        }

        // Create named values
        let namedValues: { [index: string]: any } = {
            id: id,
        }
        Object.keys(data).forEach((e) => {
            namedValues[`INSERT_${e}`] = data[e];
        });
        // Add filter values
        if (filter != null) {
            (filter as Filter[]).forEach((e: Filter) => {
                Object.keys(e.values ?? []).forEach((key) => {
                    namedValues[key] = e.values![key];
                })
            });
        }

        // Get requested scopes
        const namedQuery = named.pg(`
            UPDATE 
                ${scheme}.${table}
            SET 
                ${Object.keys(data).map((e, index) => {
            if (index == 0) return `${e} = :INSERT_${e}`;
            return `, ${e} = :INSERT_${e}`;
        }).join('\n')}
            WHERE TRUE
                ${id != null ? `AND ${scheme}.${table}.id = :id` : ''}
                ${filter != null ? (filter as Filter[]).map((e) => `AND ${(e.where as string).replace(/\$scheme/g, scheme).replace(/\$table/g, table)}\n`).join('') : ''}
            ${returnData ? 'RETURNING *' : ''};
        `, { useNullForMissing: true })(namedValues)
        const resultProfile = await _client.query(namedQuery)

        // Commit transaction
        if (!client) await _client.query('COMMIT')

        // Return machine list
        return callbackAndReturn({ success: true, data: resultProfile.rows.length == 1 ? resultProfile.rows[0] : resultProfile.rows }, callback);
    } catch (e) {

        logging.error(e);

        // Rollback transaction
        if (!client) await _client.query('ROLLBACK');

        throw new ErrorWithCodeAndMessage({
            success: false,
            message: `Internal server error (scheme: ${scheme}, table: ${table}, data: ${JSON.stringify(data, null, 4)}, filter: ${filter})`,
            error_code: 'be883d66-7121-53ae-be7e-e1bb588cc093'
        });
    } finally {
        if (!client) _client.release()
        outputExecutionTime(__filename, pgSimplePatch.name, process.hrtime(start)[1] / 1000000);
    }
}

interface pgSimpleDeleteInterface {
    scheme: string,
    table: string,
    id?: string | null,
    filter?: Filter[] | { [index: string]: any },
    keyMapping?: { [index: string]: string } | null,
    callback?: ((result: Object) => any) | null,
    client?: PoolClient | null,
}
export async function pgSimpleDelete ({ scheme, table, id = null, keyMapping = null, filter = [], callback = null, client = null }: pgSimpleDeleteInterface): Promise<{ [index: string]: any }> {

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    try {

        // Begin transaction
        if (!client) await _client.query('BEGIN')

        // Convert filter map to array
        if (filter != null && typeof filter.length == "undefined") {
            let newFilter: Filter[] = []
            for (let [key, value] of Object.entries(filter)) {
                let id = crypto.randomBytes(20).toString('hex');
                newFilter.push({
                    where: `${scheme}.${table}.${key} = :${id}`,
                    values: { [id]: value }
                })
            }
            filter = newFilter;
        }

        // A filter must be provided
        if (!id && (!filter || filter.length == 0)) {
            throw new ErrorWithCodeAndMessage({
                success: false,
                message: `No filter provided (scheme: ${scheme}, table: ${table}, filter: ${filter})`,
                error_code: 'cbbb7599-224f-527d-af13-62204f9b3648'
            });
        }

        // Create named values
        let namedValues: { [index: string]: any } = {
            id: id
        }
        // Add filter values
        if (filter != null) {
            (filter as Filter[]).forEach((e: Filter) => {
                Object.keys(e.values ?? []).forEach((key) => {
                    namedValues[key] = e.values![key];
                })
            });
        }

        // Get requested scopes
        const namedQuery = named.pg(`
            DELETE FROM 
                ${scheme}.${table}
            WHERE TRUE
                ${id != null ? `AND ${scheme}.${table}.id = :id` : ''}
                ${filter != null ? (filter as Filter[]).map((e) => `AND ${(e.where as string).replace(/\$scheme/g, scheme).replace(/\$table/g, table)}\n`).join('') : ''}
            RETURNING *;
        `, { useNullForMissing: true })(namedValues)
        const deleteResult = await _client.query(namedQuery);

        // Commit transaction
        if (!client) await _client.query('COMMIT')

        // Return profile list
        return callbackAndReturn({ success: true, data: deleteResult.rowCount }, callback);

    } catch (e) {

        logging.warn(e)

        // Rollback transaction
        if (!client) await _client.query('ROLLBACK');

        // Callback error
        throw new ErrorWithCodeAndMessage({
            success: false,
            message: `Internal server error (scheme: ${scheme}, table: ${table}, filter: ${filter})`,
            error_code: 'a455f906-52af-5e1a-a004-37cf00cbcd8e'
        });

    } finally {
        if (!client) _client.release()
    }
}

interface pgSimpleGetInterface {
    scheme: string,
    table: string,
    id?: string | null,
    keys?: string[] | null,
    filter?: Filter[] | { [index: string]: any },
    orderBy?: string | { [x: string]: string; } | null,
    groupBy?: string | string[] | null,
    join?: Join[] | null,
    limit?: number | null,
    offset?: number | null,
    request?: Request | null,
    forceAsList?: boolean,
    keyMapping?: { [index: string]: string } | null,
    allowedKeys?: string[] | null,
    hideDeleted?: boolean,
    callback?: ((result: Object) => any) | null,
    client?: PoolClient | null,
    debug?: boolean,
}
export async function pgSimpleGet ({ scheme, table, id = null, keys = null, filter = [], request = null, orderBy = null, groupBy = null, join = null, limit = null, offset = null, forceAsList = false, keyMapping = null, allowedKeys = null, hideDeleted = true, callback = null, client = null, debug = false }: pgSimpleGetInterface): Promise<{ [index: string]: any }> {

    // Get function start time
    const start: [number, number] = process.hrtime();

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    try {

        let _limit = limit;
        let _offset = offset
        let _orderBy = orderBy
        let _groupBy: string | string[] | { [x: string]: string; } | null = groupBy

        // Convert filter map to array
        if (filter != null && typeof filter.length == "undefined") {
            let newFilter: Filter[] = []
            for (let [key, value] of Object.entries(filter)) {
                // Validate key -> Should be in allowedKeys
                if (allowedKeys != null && !allowedKeys.includes(key)) {
                    throw new ErrorWithCodeAndMessage({
                        success: false,
                        message: `Key not allowed (scheme: ${scheme}, table: ${table}, key: ${key})`,
                        error_code: 'a455f906-52af-5e1a-a004-37cf00cbcd8e'
                    });
                }
                key = await pgMapKeyName({ key: key, mapping: keyMapping });
                let id = crypto.randomBytes(20).toString('hex');
                if(value == null || value == 'null' || value == 'NULL'){
                    newFilter.push({
                        where: `${scheme}.${table}.${key} IS NULL`,
                    })
                }
                else if (value == 'NOT NULL' || value == 'not null'){
                    newFilter.push({
                        where: `${scheme}.${table}.${key} IS NOT NULL`,
                    })
                }
                else if (Array.isArray(value)){
                    newFilter.push({
                        where: `${scheme}.${table}.${key} IN (:${id})`,
                        values: { [id]: value }
                    })
                }
                else{
                    newFilter.push({
                        where: `${scheme}.${table}.${key} = :${id}`,
                        values: { [id]: value }
                    })
                }
            }
            filter = newFilter;
        }

        // Collect data from request
        if (request) {

            let search = typeof request.query.search == "string" ? request.query.search : null;
            if (_limit == null && typeof request.query.limit == "string" && !Number.isNaN(parseInt(request.query.limit))) _limit = parseInt(request.query.limit);
            if (_offset == null && typeof request.query.offset == "string" && !Number.isNaN(parseInt(request.query.offset))) _offset = parseInt(request.query.offset);
            if (_orderBy == null && typeof request.query.orderBy == "string") _orderBy = request.query.orderBy;

            // Detect and parse filters
            if (search != null) {

                // Simplify search string
                search = search.trim();

                // Check for "key:null"
                {
                    const regExp = /([A-Za-z0-9}\-]+)\:null/g
                    while (regExp.test(search)) {
                        const result = regExp.exec(search);
                        if (result) {
                            filter.push({
                                where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL`,
                            });
                            search = search.replace(result[0], "").trim();
                        }
                    }
                }

                // Check for "key:uuid"
                {
                    const regExp = /([A-Za-z0-9}\-]+)\:([a-z0-9]{8}\-[a-z0-9]{4}\-[a-z0-9]{4}\-[a-z0-9]{4}\-[a-z0-9]{12})(?:\|\|(null))?/;
                    while (regExp.test(search)) {
                        const result = regExp.exec(search);
                        if (result) {
                            let filterId = crypto.randomBytes(20).toString('hex');
                            if (result.indexOf("null") >= 0) {
                                filter.push({
                                    where: `(${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId} OR ${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL)`,
                                    values: { [filterId]: result[2] },
                                });
                            }
                            else {
                                filter.push({
                                    id: filterId,
                                    where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId}`,
                                    values: { [filterId]: result[2] },
                                });
                            }
                            search = search.replace(result[0], "").trim();
                        }
                    }
                }

                // Check for "key:boolean"
                {
                    const regExp = /([A-Za-z0-9}\-]+)\:(true|false)/;
                    while (regExp.test(search)) {
                        const result = regExp.exec(search);
                        if (result) {
                            let filterId = crypto.randomBytes(20).toString('hex');
                            if (result.indexOf("null") >= 0) {
                                filter.push({
                                    where: `(${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId} OR ${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL)`,
                                    values: { [filterId]: result[2] == "true" ? true : result[2] == "false" ? false : null },
                                });
                            }
                            else {
                                filter.push({
                                    where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId}`,
                                    values: { [filterId]: result[2] == "true" ? true : result[2] == "false" ? false : null },
                                });
                            }
                            search = search.replace(result[0], "").trim();
                        }
                    }
                }

                // Check for "key:number"
                {
                    const regExp = /([A-Za-z0-9}\-]+)\:([0-9]+(?:\.[0-9]+)?)\-([0-9]+(?:\.[0-9]+)?)/g
                    while (regExp.test(search)) {
                        const result = regExp.exec(search);
                        if (result) {
                            let filterId = crypto.randomBytes(20).toString('hex');
                            if (result.indexOf("null") >= 0) {
                                filter.push({
                                    where: `(${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId} OR ${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL)`,
                                    values: { [filterId]: result[2] },
                                });
                            }
                            else {
                                filter.push({
                                    id: filterId,
                                    where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId}`,
                                    values: { [filterId]: result[2] },
                                });
                            }
                            search = search.replace(result[0], "").trim();
                        }
                    }
                }

                // Check for "key:string"
                {
                    const regExp = /([A-Za-z0-9}\-]+)\:(?:\"((?:.|\\\")*?)(?:(?<!\\)\")|((?:(?!\|\|null).|(?:\\\"))*)(?:$|(?<!\\)))(?:\|\|(null))?/g
                    while (regExp.test(search)) {
                        const result = regExp.exec(search);
                        if (result) {
                            let filterId = crypto.randomBytes(20).toString('hex');
                            if (result.indexOf("null") >= 0) {
                                filter.push({
                                    where: `(${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId} OR ${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL)`,
                                    values: { [filterId]: result[2] },
                                });
                            }
                            else {
                                filter.push({
                                    where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId}`,
                                    values: { [filterId]: result[2] },
                                });
                            }
                            search = search.replace(result[0], "").trim();
                        }
                    }
                }

                // Everything else
                /*if (search != "") {
                    searchTerm = (searchTerm ?? "") + " AND (name ILIKE $" + (searchValues.length + 3).toString() + ")";
                    searchValues.push("%" + search.replace(/[%\\]/g, '\\$&') + "%");
                }*/
            }
        }

        let namedValues: { [index: string]: any } = {
            id: id,
            limit: (_limit === -1 ? '9223372036854775807' : _limit) ?? '9223372036854775807',
            offset: (_offset === -1 ? 0 : _offset) ?? 0,
        }

        // Add filter values
        if (filter != null) {
            (filter as Filter[]).forEach((e: Filter) => {
                Object.keys(e.values ?? []).forEach((key) => {
                    namedValues[key] = e.values![key];
                })
            });
        }

        // Convert orderBy to map if string (e.g. "id ASC, name DESC")
        if (typeof _orderBy == "string") {
            let orderByMap: { [x: string]: string; } = {};
            _orderBy.split(',').forEach(async (e) => {
                let [key, value] = e.split(' ');
                key = await pgMapKeyName({ key: key, mapping: keyMapping });
                value = value.trim();
                orderByMap[key] = value;
            })
            _orderBy = orderByMap;
        }

        // Create order by string
        let orderByString: string | null = null;
        if (_orderBy != null && Object.keys(_orderBy).length > 0) {
            orderByString = "";
            Object.keys(_orderBy).forEach(async (key: string, index) => {
                orderByString += `${scheme}.${table}.${key} ${(_orderBy as { [x: string]: string; })[key]}`;
                if (index < Object.keys(_orderBy as { [x: string]: string; }).length - 1) orderBy += ", ";
            });
        }

        // Convert groupBy to map if string (e.g. "id, name")
        if (typeof _groupBy == "string") {
            let groupByArray: string[] = [];
            _groupBy.split(',').forEach(async (e) => {
                groupByArray.push(e.trim());
            })
            _groupBy = groupByArray;
        }

        // Create group by string
        let groupByString: string | null = null;
        if (_groupBy != null && (_groupBy as string[]).length > 0) {
            groupByString = "";
            (_groupBy as string[]).forEach(async (key: string, index) => {
                groupByString += `${scheme}.${table}.${key}`;
                if (index < (_groupBy as string[]).length - 1) groupBy += ", ";
            });
        }

        // Get requested data
        const namedQuery = named.pg(`
            SELECT 
                ${scheme}.${table}.id, 
                FLOOR(EXTRACT(EPOCH FROM ${scheme}.${table}.created_at)) AS created_at${keys != null && keys.length > 0 ? ',' : ''}
                ${keys != null ? keys?.map((element, _index) => /^[a-z\_]$/.test(element) ? `${scheme}.${table}.${element}\n` : `${element}`) : ''}
            FROM 
                ${scheme}.${table}
            ${join != undefined && join?.length > 0 ? join.map((element, _index) => element.toQuery()).join('\n') : ''}
            WHERE TRUE
                ${id != null ? `AND ${scheme}.${table}.id = :id` : ''}
                ${filter != null ? (filter as Filter[]).map((e) => `AND ${(e.where as string).replace(/\$scheme/g, scheme).replace(/\$table/g, table)}\n`).join('') : ''}
            ${groupByString != null ? `GROUP BY ${groupByString}` : ''}
            ORDER BY 
                ${orderByString ?? `${scheme}.${table}.created_at DESC`}
            LIMIT 
                :limit
            OFFSET
                :offset
        `, { useNullForMissing: true })(namedValues);
        if (debug) logging.debug(namedQuery);
        const result = await _client.query(namedQuery);
        if (result.rowCount == null || result.rowCount < 0) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '561c1368-5626-5ae3-af8d-a153eb59d499' });

        // Return list
        return callbackAndReturn({ success: true, data: (id != null || result.rows.length == 1) && !forceAsList ? result.rows[0] : result.rows }, callback);
    } catch (e) {
        logging.warn(`Failed to get data from ${scheme}.${table} with id ${id} and filter ${JSON.stringify(filter)}: ${(e as any)?.message ?? e}`);
        throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '98b4307f-79e0-5490-b5d0-bd5cf037ff5a' });
    } finally {
        if (!client) _client.release()
        outputExecutionTime(__filename, pgSimpleGet.name, process.hrtime(start)[1] / 1000000);
    }
}

interface pgSimpleGetLastUpdateInterface {
    scheme: string,
    table: string,
    id?: string | null,
    filter?: { [index: string]: any } | null,
    callback?: ((result: Object) => any) | null,
    client?: PoolClient | null,
}
export async function pgSimpleGetLastUpdate ({ scheme, table, id = null, filter = null, callback = null, client = null }: pgSimpleGetLastUpdateInterface): Promise<{ [index: string]: any }> {

    // Get function start time
    const start: [number, number] = process.hrtime();

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    try {

        // Get requested data
        const result = await _client.query(named.pg(`
            SELECT 
                ${scheme}.${table}.id, 
                FLOOR(EXTRACT(EPOCH FROM ${scheme}.${table}.created_at)) AS created_at
            FROM 
                ${scheme}.${table}
            WHERE TRUE
                ${id != null ? `AND ${scheme}.${table}.id = :id` : ''}
                ${filter != null ? Object.keys(filter).map((e, index) => `AND ${scheme}.${table}.${e} = :${e}`).join('\n') : ''}
            ORDER BY 
                created_at DESC
            LIMIT 
                1
            `, { useNullForMissing: true })({
            id: id,
            limit: 1,
            ...(filter as { [index: string]: any; }),
        }));
        if (result.rowCount == null || result.rowCount < 0) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: 'e7fd75b1-feb1-5080-9a6b-d9cb8ae4ad86' });
        if (result.rowCount == null || result.rowCount > 1) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: 'bc4d5693-58ac-5cf3-9a02-fc069b693838' });

        // Return list
        return callbackAndReturn({ success: true, data: result.rows[0] }, callback);
    } catch (e) {
        logging.warn(e)
        throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '37a911f6-2506-538d-869d-f9d18189478a' });
    } finally {
        if (!client) _client.release()
        outputExecutionTime(__filename, pgSimpleGet.name, process.hrtime(start)[1] / 1000000);
    }
}

interface pgSimplePostInterface {
    scheme: string,
    table: string,
    keyValue?: { [index: string]: any },
    callback?: ((result: Object) => any) | null,
    client?: PoolClient | null,
    returnData?: boolean,
}
export async function pgSimplePost ({ scheme, table, keyValue = {}, callback = null, client = null, returnData = true }: pgSimplePostInterface): Promise<{ [index: string]: any }> {

    // Get function start time
    const start: [number, number] = process.hrtime();

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    try {
        // Try to insert 
        const addResult = Object.keys(keyValue).length > 0 ?
            await _client.query(`
                INSERT INTO ${scheme}.${table} (${Object.keys(keyValue).map((element, index) => element)}) 
                VALUES (${Object.keys(keyValue).map((element, index) => `\$${index + 1}`)}) 
                ${returnData ? 'RETURNING *' : ''};
            `, [...Object.values(keyValue).map((element, index) => element)]) :
            await _client.query(`
                INSERT INTO ${scheme}.${table} DEFAULT VALUES
                ${returnData ? 'RETURNING *' : ''};
            `);
        if (addResult.rowCount == null || addResult.rowCount < 0) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '923f61f0-a886-5274-83d1-f3ecd9f3fbe7' });

        // Return list
        return callbackAndReturn({ success: true, data: addResult.rows.length == 1 ? addResult.rows[0] : addResult.rows }, callback);
    } catch (e) {
        logging.warn(e)

        // Rollback transaction
        if (!client) await _client.query('ROLLBACK');

        // Callback error
        throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '5b2aba0c-2c60-5f55-bb57-c4d0dbedd15a' });
    } finally {
        if (!client) _client.release()
    }
}

//=====================================================================
//== Default-Validations
//=====================================================================

interface IsCalculableValueType {
    value: any,
    min?: number | null,
    max?: number | null,
}
export function isCalculableValue ({ value, min = null, max = null }: IsCalculableValueType): { [index: string]: any } {
    if (value == null || (typeof value != "number" && typeof value != "string")) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid number or not calculable", error_code: 'f8a63c07-4c42-5219-ba65-579ce0ef05d1' });
    else if (typeof value == "string") {
        try {
            value = limitedMathCalculator(value);
        }
        catch (e) {
            throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid number or not calculable", error_code: '0f7eb8c5-a955-5bbd-9283-1732e2c16d8f' })
        }
    }
    if (Number.isNaN(value)) throw new ErrorWithCodeAndMessage({ success: false, message: `Invalid number`, error_code: '7aa9b120-a539-570b-ab98-4d0698f294be' });
    if ((min != null && value < min) || (max != null && value > max)) throw new ErrorWithCodeAndMessage({ success: false, message: `Value not in range (${min != null ? `Min: ${min}` : ''}${min != null && max != null ? `, ` : ''}${max != null ? `Max: ${max}` : ''})`, error_code: '3414474c-096f-557a-96f1-506997cd9931' });
    return { success: true }
}

interface IsNumberType {
    value: any,
    min?: number | null,
    max?: number | null,
    isInteger?: boolean,
}
export function isNumber ({ value, min = null, max = null, isInteger = false }: IsNumberType): { [index: string]: any } {
    if (value == null || (typeof value != "number" && typeof value != "string")) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid number", error_code: '2d316e51-be57-54b4-82c9-3f0cf53ddbf3' });
    else if (typeof value == "string") {
        try {
            value = parseFloat(value);
        }
        catch (e) {
            throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid number", error_code: '0c7b32bb-99b4-570b-8b44-5a32fa4caabd' })
        }
    }
    if (Number.isNaN(value)) throw new ErrorWithCodeAndMessage({ success: false, message: `Invalid number`, error_code: 'b07a1972-97c8-55e3-8161-9a34e8bcdde5' });
    if (isInteger && !Number.isInteger(value)) throw new ErrorWithCodeAndMessage({ success: false, message: `Invalid number`, error_code: 'a7413008-9397-55b5-90e8-166eb2ef2cff' });
    if ((min != null && value < min) || (max != null && value > max)) throw new ErrorWithCodeAndMessage({ success: false, message: `Value not in range (${min != null ? `Min: ${min}` : ''}${min != null && max != null ? `, ` : ''}${max != null ? `Max: ${max}` : ''})`, error_code: '3414474c-096f-557a-96f1-506997cd9931' });
    return { success: true }
}

interface IsDate {
    value: String | Date,
}
export function isDate ({ value }: IsDate): { [index: string]: any } {
    if (value == null || (typeof value != "string" && !(value instanceof Date))) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid date", error_code: '9b9a586b-33bb-5f01-9e9b-6b4b60943a15' });
    else if (typeof value == "string" && !moment(value, 'YYYY-MM-DD', true).isValid()) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid date", error_code: 'b8b8331b-0b75-503c-b4fc-7c6b8377382d' });
    return { success: true }
}

interface IsTime {
    value: String | number,
    withSecoonds?: boolean,
}
export function isTime ({ value, withSecoonds = false }: IsTime): { [index: string]: any } {
    if (value == null || (typeof value != "string" && typeof value != "number")) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid time", error_code: 'd441bb41-c585-527c-a884-29d90953d365' });
    else if (typeof value == "string") {
        if (withSecoonds && !moment(value, 'hh:mm:ss', true).isValid()) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid time", error_code: 'fa231660-aecc-5cec-ab23-1f170cf8f40d' });
        else if (!withSecoonds && !moment(value, 'hh:mm', true).isValid()) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid time", error_code: '4c0d7354-526a-53fb-b3ce-625ceb3fb211' });
        value = withSecoonds ? moment(value, 'hh:mm:ss', true).seconds() : moment(value, 'hh:mm', true).minutes();
    }
    if (withSecoonds && (value < 0 || value >= 86400)) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid time", error_code: '56d30c1d-7e07-5b0a-9bf4-fb3664c062df' });
    if (withSecoonds && (value < 0 || value >= 1440)) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid time", error_code: '56d30c1d-7e07-5b0a-9bf4-fb3664c062df' });
    return { success: true }
}

interface IsBoolean {
    value: String | boolean,
}
export function isBoolean ({ value }: IsBoolean): { [index: string]: any } {
    if (value == null || (typeof value != "string" && typeof value != "boolean")) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid boolean", error_code: '36c526fc-45c5-5f64-aeff-62cd23b9396d' });
    else if (typeof value == "string" && !(/^(?:TRUE|FALSE)$/i.test(value))) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid boolean", error_code: '9cd04962-a5f6-5850-accc-dd6a552a863f' });
    return { success: true }
}

interface Validate {
    value: any,
    rules: ValidationType
}
export function validate ({ value, rules }: Validate): { success: boolean, message?: string, error_code?: string } {
    if (rules.type == 'string') {
        // Validate if required and value is null or empty string
        if (!rules.required && (value == null || value == '')) return { success: true };
        if (rules.required && (value == null || value == '')) return { success: false, message: `${rules.name} is required`, error_code: '4e17c1e7-aec6-5d7b-8d4d-3ac6e15c8520' };

        // Validate if value is a string or can be converted to a string
        if (value == null || (typeof value != "string" && typeof value != "number" && typeof value != "boolean")) return { success: false, message: `${rules.name} must be a string`, error_code: 'b7b5b5e1-5b1f-5b9f-8b5b-5e1b5b1f5b9f' };
        else if (typeof value != "string") value = value.toString();

        if (rules.min) return { success: false, message: `${rules.name} must be at least ${rules.min} characters`, error_code: '56d95835-e72c-51ac-ac19-fba0b5c481a3' };
        if (rules.max) return { success: false, message: `${rules.name} must be at most ${rules.max} characters`, error_code: '87e4cedd-a223-56c0-a8a1-bca16807a6d9' };
        if (rules.allowedChars && !new RegExp(`^[${rules.allowedChars}]+$`).test(value)) return { success: false, message: `${rules.name} contains invalid characters`, error_code: '4c38141b-5436-59c5-a537-d9201ea50570' };
        if (rules.pattern && !(new RegExp(rules.pattern).test(value))) return { success: false, message: `${rules.name} is invalid`, error_code: '8a0cd2ba-2354-5a23-b4da-5ed0c74ab2fd' };

        return { success: true };
    }
    else if (rules.type == 'number') {

        // Validate if required and value is null or empty string
        if (!rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: true };
        if (rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: false, message: `${rules.name} is required`, error_code: '72773c6d-52a5-5e7a-88f9-3ce0a005f0f6' };

        // Validate if value is a number or a string that can be converted to a number
        if (value == null || (typeof value != "number" && typeof value != "string")) return { success: false, message: `${rules.name} is invalid`, error_code: '1fb16877-b708-5217-a5a0-044c3564b614' };
        else if (typeof value == "string" && !/^-?\d*(\.\d+)?$/.test(value)) return { success: false, message: `${rules.name} is invalid`, error_code: 'eb718877-e6bb-5754-9ef0-c281f3d78273' };
        value = Number(value);

        if (rules.min && value < rules.min) return { success: false, message: `${rules.name} must be at least ${rules.min}`, error_code: 'f34944e2-3154-5bd4-8897-3c76ac65086e' };
        if (rules.max && value > rules.max) return { success: false, message: `${rules.name} must be at most ${rules.max}`, error_code: '124a10e9-3352-5cac-85e6-c4bd1349284f' };
        if (rules.decimals) {
            let decimals = value.toString().split('.')[1];
            if (decimals && decimals.length > rules.decimals) return { success: false, message: `${rules.name} must have at most ${rules.decimals} decimals`, error_code: '107bfb13-3b2a-5737-be12-a098b1c4f5e2' };
        }

        return { success: true };
    }
    else if (rules.type == 'date-time') { // Formmat must be YYYY-MM-DDTHH:mm:ss.sssZ for example 22023-03-28T14:56:23.660Z
        // Validate if required and value is null or empty string
        if (!rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: true };
        if (rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: false, message: `${rules.name} is required`, error_code: 'b74c1bc1-4a57-582a-b42f-e4dd382540c2' };

        // Check if value is moment object
        if (value instanceof moment) {
            if (!(value as moment.Moment).isValid()) {
                return { success: false, message: `${rules.name} is invalid`, error_code: '810ff853-bac8-5ba7-a56f-d0cc1f8bff77' };
            }
            value = (value as moment.Moment).toDate();
        }

        // Validate if value is a date or a string that can be converted to timestamp (number)
        if (value == null || (typeof value != "string" && !(value instanceof Date))) return { success: false, message: `${rules.name} is invalid`, error_code: 'e3bc3352-9f36-53c5-960f-db53b436246a' };
        else if (typeof value == "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return { success: false, message: `${rules.name} is invalid`, error_code: 'e3bc3352-9f36-53c5-960f-db53b436246a' };
        else if (typeof value == "string") value = new Date(value);

        if (rules.min && value < rules.min) return { success: false, message: `${rules.name} must be at least ${rules.min}`, error_code: 'f34944e2-3154-5bd4-8897-3c76ac65086e' };
        if (rules.max && value > rules.max) return { success: false, message: `${rules.name} must be at most ${rules.max}`, error_code: '124a10e9-3352-5cac-85e6-c4bd1349284f' };

        return { success: true };
    }
    else if (rules.type == 'date') {

        // Validate if required and value is null or empty string
        if (!rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: true };
        if (rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: false, message: `${rules.name} is required`, error_code: 'b74c1bc1-4a57-582a-b42f-e4dd382540c2' };

        // Check if value is moment object
        if (value instanceof moment) {
            if (!(value as moment.Moment).isValid()) {
                return { success: false, message: `${rules.name} is invalid`, error_code: '810ff853-bac8-5ba7-a56f-d0cc1f8bff77' };
            }
            value = (value as moment.Moment).toDate();
        }

        // Validate if value is a date or a string that can be converted to timestamp (number)
        if (value == null || (typeof value != "string" && !(value instanceof Date))) return { success: false, message: `${rules.name} is invalid`, error_code: 'e3bc3352-9f36-53c5-960f-db53b436246a' };
        else if (typeof value == "string" && !/^\d{4}-\d{2}-\d{2}$/.test(value) && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return { success: false, message: `${rules.name} is invalid`, error_code: 'e3bc3352-9f36-53c5-960f-db53b436246a' };

        return { success: true };
    }
    else if (rules.type == 'time') {
        // Validate if required and value is null or empty string
        if (!rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: true, };
        if (rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: false, message: `${rules.name} is required`, error_code: '29f2b4a6-4e17-5802-8c03-25130806eac7' };

        // Check if value is moment object
        if (value instanceof moment) {
            if (!(value as moment.Moment).isValid()) {
                return { success: false, message: `${rules.name} is invalid`, error_code: '13d5557e-69f4-5ff3-992e-c80218935a15' };
            }
            value = (value as moment.Moment).toDate();
        }

        // Validate if value is a date or a string that can be converted to timestamp (number)
        if (value == null || (typeof value != "string" && !(value instanceof Date))) return { success: false, message: `${rules.name} is invalid`, error_code: 'e51ad5073-899e-5ee9-abb6-d92a96e3e31f' };
        else if (typeof value == "string" && !/^\d{2}:\d{2}:\d{2}$/.test(value)) return { success: false, message: `${rules.name} is invalid`, error_code: '07219201-9b2f-5240-9b17-793914c8b76e' };
        //else if (typeof value == "string") value = new Date(value).getTime();
        //else value = value.getTime();

        return { success: true };
    }
    else if (rules.type == 'boolean') {
        // Validate if required and value is null or empty string
        if (!rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: true };
        if (rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: false, message: `${rules.name} is required`, error_code: 'b4e06719-384e-5130-87f0-1bf12307259a' };

        // Validate if value is a boolean or a string that can be converted to boolean
        if (value == null || (typeof value != "boolean" && typeof value != "string")) return { success: false, message: `${rules.name} is invalid`, error_code: '418539e4-0474-5125-b4aa-62d92dfb7230' };
        else if (typeof value == "string" && !/^(true|false)$/.test(value)) return { success: false, message: `${rules.name} is invalid`, error_code: '250d6a46-6860-55f1-b04c-bfb0a37db9cb' };
        //else if (typeof value == "string") value = value == 'true';

        return { success: true };
    }
    else if (rules.type == 'id') {
        // Validate if required and value is null or empty string
        if (!rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: true };
        if (rules.required && (value == null || (typeof value === "string" && value == ''))) return { success: false, message: `${rules.name} is required`, error_code: '784db3b0-eca0-5c61-8db9-db6f3a02353b' };

        // Validate if value is a string
        if (value == null || typeof value != "string") return { success: false, message: `${rules.name} is invalid`, error_code: '7366c0c5-a861-5b0b-8aeb-0b7e2431016d' };

        // Validate if value is a valid id (UUID)
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) return { success: false, message: `${rules.name} is invalid`, error_code: 'ee6797a3-9ade-5171-b9ca-325f66dd9db4' };

        return { success: true };
    }
    else {
        throw new Error(`Type ${rules.type} is not supported`);
    }
}

interface ValidateAll {
    // Data as list of { name, value, type, rules }
    data: any,
}
export function validateAll ({ data }: ValidateAll): { success: boolean, message?: string, error_code?: string } {
    for (const key in data) {
        const value = data[key];
        if (value == null) continue; // Skip if value is null
        if (value.rules == null && value.type == null) continue; // Skip if rules and type are null
        const validation = validate({ value: value.value, rules: value.rules ? value.rules : { name: value.name, type: value.type } });
        if (!validation.success) return validation;
    }
    return { success: true };
}

interface Convert {
    value: any,
    type: 'string' | 'number' | 'date-time' | 'date' | 'time' | 'boolean',
    rules?: any,
}
export function convert ({ value, type, rules = {} }: Convert): any {

    // Return null if value is null and not required
    if (!rules.required && value == null) return null;

    // Validate value
    const validation = validate({ value, rules });
    if (!validation.success) throw new Error(validation.message);

    if (type == 'string') {

        // If not required and value is null or empty string, return null
        if (!rules.required && (typeof value === "string" && value == '')) return null;

        // Empty string if value is null
        if (value == null) value = '';

        // Convert if value is a number or a boolean
        if (typeof value == "number" || typeof value == "boolean") value = value.toString();

        // Trim value
        value = value.trim();

        // Convert to uppercase
        if (rules.uppercase) value = value.toUpperCase();

        // Convert to lowercase
        if (rules.lowercase) value = value.toLowerCase();

        return value
    }
    else if (type == 'number') {

        // Convert if value is a string
        if (typeof value == "string") {
            if (rules.step == 1) value = parseInt(value);
            else value = parseFloat(value);
        }

        return value
    }
    else if (type == 'date-time') { // Return as date object

        // Convert if value is a string
        if (typeof value == "string") value = new Date(value);
        else value = new Date(value);

        return value
    }
    else if (type == 'date') { // Return as date object

        // Convert if value is a string
        if (typeof value == "string") value = new Date(value);
        else value = new Date(value);

        return value
    }
    else if (type == 'time') { // Return as date object

        // Convert if value is a string
        if (typeof value == "string") value = new Date(value);
        else value = new Date(value);

        return value
    }
    else if (type == 'boolean') {

        // Convert if value is a string
        if (typeof value == "string") value = value == 'true';

        return value
    }
    else {
        throw new Error(`Type ${type} is not supported`);
    }
}

//=====================================================================
//== MathJS
//=====================================================================

const math = create(all)
math.import({
    'import': function () { throw new Error('Function import is disabled') },
    'createUnit': function () { throw new Error('Function createUnit is disabled') },
    //'evaluate': function () { throw new Error('Function evaluate is disabled') },
    //'parse': function () { throw new Error('Function parse is disabled') },
    'simplify': function () { throw new Error('Function simplify is disabled') },
    'derivative': function () { throw new Error('Function derivative is disabled') }
}, { override: true })
const limitedMathCalculator = math.evaluate
export { limitedMathCalculator }

//=====================================================================
//== Default-Converts
//=====================================================================

interface ConvertToBoolean {
    value: String | boolean,
}
export function convertToBoolean ({ value }: ConvertToBoolean): boolean {
    if (typeof value == "string") {
        if (/^TRUE$/i.test(value)) return true;
        else if (/^FALSE$/i.test(value)) return false;
        throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid boolean", error_code: '8c55912d-9ecb-5933-a37f-6b1041fe070a' });
    }
    return value as boolean;
}

//=====================================================================
//== Classes
//=====================================================================

export class ErrorWithCodeAndMessage extends Error {

    public result: { [index: string]: any };

    constructor (result: { [index: string]: any }) {
        super(result.message);
        this.result = result;
    }
}
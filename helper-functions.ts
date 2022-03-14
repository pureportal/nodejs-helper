import { PoolClient } from "pg";
import { pool } from "~/postgres";
import { Request } from "express";
import named from 'yesql';
import moment from "moment";
import * as uuid from 'uuid';
import crypto from 'crypto';
import { create, all } from 'mathjs'

//=====================================================================
//== Types
//=====================================================================

export type Filter = {
    id: string,
    where: string,
    value?: any | any[],
}

//=====================================================================
//== Functions
//=====================================================================

export function outputExecutionTime(fileName: string, functionName: string, executionTime: number) {
    console.info(fileName.replace((global as any).appRoot, "~") + ':' + functionName + ' [Execution time]: %dms', executionTime);
}

export function callbackAndReturn(data: any, callback?: ((result: any) => any) | null): any {
    if (callback) callback(data);
    return data
}

export function isDebug() {
    return process.env.NODE_ENV !== 'production';
};

//=====================================================================
//== SQL Helper
//=====================================================================

interface PgGetOrderDirectionInterface {
    orderByDirection?: any
}
export async function pgGetOrderDirection({ orderByDirection }: PgGetOrderDirectionInterface): Promise<'ASC' | 'DESC' | null> {
    if (typeof orderByDirection == "string") {
        if (/^ASC$/i.test(orderByDirection)) return 'ASC';
        if (/^DESC$/i.test(orderByDirection)) return 'DESC';
    }
    return null;
}

interface PgMapKeyNameInterface {
    key: string,
    mapping: { [index: string]: string } | null,
}
export async function pgMapKeyName({ key, mapping }: PgMapKeyNameInterface): Promise<string> {
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
    id: string,
    key: string,
    value: unknown,
    callback?: ((result: Object) => any) | null,
    client?: PoolClient | null,
}
export async function pgSimplePatch({ scheme, table, id, key, value, callback = null, client = null }: PgSimplePatchInterface): Promise<{ [index: string]: any }> {

    // Get function start time
    const start: [number, number] = process.hrtime();

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    try {

        // Begin transaction
        if (!client) await _client.query('BEGIN')

        // Get requested scopes
        const resultProfile = await _client.query(`
            UPDATE 
                ${scheme}.${table}
            SET 
                ${key} = $2
            WHERE 
                id = $1 
            `, [id, value]);
        if (resultProfile.rowCount <= 0 || resultProfile.rowCount > 1) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: 'a455f906-52af-5e1a-a004-37cf00cbcd8e' });

        // Commit transaction
        if (!client) await _client.query('COMMIT')

        // Return machine list
        return callbackAndReturn({ success: true }, callback);
    } catch (e) {

        // Rollback transaction
        if (!client) await _client.query('ROLLBACK');

        throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: 'd59e8c88-396e-50df-a1e3-83e9d17961ac' });
    } finally {
        if (!client) _client.release()
        outputExecutionTime(__filename, pgSimplePatch.name, process.hrtime(start)[1] / 1000000);
    }
}

interface pgSimpleDeleteInterface {
    scheme: string,
    table: string,
    id: string,
    callback?: ((result: Object) => any) | null,
    client?: PoolClient | null,
}
export async function pgSimpleDelete({ scheme, table, id, callback = null, client = null }: pgSimpleDeleteInterface): Promise<{ [index: string]: any }> {

    // Get function start time
    const start: [number, number] = process.hrtime();

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    try {

        // Begin transaction
        if (!client) await _client.query('BEGIN')

        // Try to insert 
        const deleteResult = await _client.query(`
                DELETE
                FROM 
                    ${scheme}.${table}
                WHERE 
                    id = $1
                `, [id]);

        // Commit transaction
        if (!client) await _client.query('COMMIT')

        // Return profile list
        return callbackAndReturn({ success: true, data: deleteResult.rowCount }, callback);

    } catch (e) {

        console.warn(e)

        // Rollback transaction
        if (!client) await _client.query('ROLLBACK');

        // Callback error
        throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '1b71c5f4-b485-5dc0-b5b7-83578f25cf2c' });

    } finally {
        if (!client) _client.release()
        outputExecutionTime(__filename, pgSimpleDelete.name, process.hrtime(start)[1] / 1000000);
    }
}

interface pgSimpleGetInterface {
    scheme: string,
    table: string,
    id?: string | null,
    keys?: string[] | null,
    filter?: Filter[] | { [index: string]: any },
    orderBy?: string | null,
    orderDirection?: "ASC" | "DESC" | null,
    limit?: number | null,
    offset?: number | null,
    request?: Request | null,
    forceAsList?: boolean,
    keyMapping?: { [index: string]: string } | null,
    allowedKeys?: string[] | null,
    callback?: ((result: Object) => any) | null,
    client?: PoolClient | null,
}
export async function pgSimpleGet({ scheme, table, id = null, keys = null, filter = [], request = null, orderBy = null, orderDirection = null, limit = null, offset = null, forceAsList = false, keyMapping = null, allowedKeys = null, callback = null, client = null }: pgSimpleGetInterface): Promise<{ [index: string]: any }> {

    // Get function start time
    const start: [number, number] = process.hrtime();

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    try {

        let _limit = limit;
        let _offset = offset
        let _orderBy = orderBy
        let _orderDirection = orderDirection;

        // Convert filter map to array
        if (filter != null && typeof filter.length == "undefined") {
            let newFilter: Filter[] = []
            for (let [key, value] of Object.entries(filter)) {
                key = await pgMapKeyName({ key: key, mapping: keyMapping });
                let id = crypto.randomBytes(20).toString('hex');
                newFilter.push({
                    id: id,
                    where: `${scheme}.${table}.${key} = :${id}`,
                    value: value,
                })
            }
            filter = newFilter;
        }

        // Collect data from request
        if (request) {

            let search = typeof request.query.search == "string" ? request.query.search : null;
            if (_limit == null && typeof request.query.limit == "string" && parseInt(request.query.limit) != NaN) _limit = parseInt(request.query.limit);
            if (_offset == null && typeof request.query.offset == "string" && parseInt(request.query.offset) != NaN) _offset = parseInt(request.query.offset);
            if (_orderBy == null && typeof request.query.order_by == "string") _orderBy = await pgMapKeyName({ key: request.query.order_by, mapping: keyMapping });
            if (_orderBy == null && typeof request.query["order-by"] == "string") _orderBy = await pgMapKeyName({ key: request.query["order-by"], mapping: keyMapping });
            if (_orderDirection == null && typeof request.query.order_direction == "string") _orderDirection = await pgGetOrderDirection({ orderByDirection: request.query.order_direction });

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
                            let filterId = crypto.randomBytes(20).toString('hex');
                            filter.push({
                                id: filterId,
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
                                    id: filterId,
                                    where: `(${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId} OR ${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL)`,
                                    value: result[2],
                                });
                            }
                            else {
                                filter.push({
                                    id: filterId,
                                    where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId}`,
                                    value: result[2],
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
                                    id: filterId,
                                    where: `(${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId} OR ${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL)`,
                                    value: result[2] == "true" ? true : result[2] == "false" ? false : null,
                                });
                            }
                            else {
                                filter.push({
                                    id: filterId,
                                    where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId}`,
                                    value: result[2] == "true" ? true : result[2] == "false" ? false : null,
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
                                    id: filterId,
                                    where: `(${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId} OR ${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL)`,
                                    value: result[2],
                                });
                            }
                            else {
                                filter.push({
                                    id: filterId,
                                    where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId}`,
                                    value: result[2],
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
                                    id: filterId,
                                    where: `(${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId} OR ${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} IS NULL)`,
                                    value: result[2],
                                });
                            }
                            else {
                                filter.push({
                                    id: filterId,
                                    where: `${scheme}.${table}.${await pgMapKeyName({ key: result[1], mapping: keyMapping })} = :${filterId}`,
                                    value: result[2],
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
        if (filter != null) {
            (filter as Filter[]).forEach((e) => namedValues[e.id] = e.value);
        }

        // Get requested data
        const result = await _client.query(named.pg(`
            SELECT 
                ${scheme}.${table}.id, 
                FLOOR(EXTRACT(EPOCH FROM ${scheme}.${table}.created_at)) AS created_at,
                FLOOR(EXTRACT(EPOCH FROM ${scheme}.${table}.created_at)) AS updated_at${keys != null && keys.length > 0 ? ',' : ''}
                ${keys?.map((element, index) => /^[a-z\_]$/.test(element) ? `${scheme}.${table}.${element}\n` : `${element}`)}
            FROM 
                ${scheme}.${table}
            WHERE TRUE
                ${id != null ? `AND ${scheme}.${table}.id = :id` : ''}
                ${filter != null ? (filter as Filter[]).map((e) => `AND ${(e.where as string).replace(/\$scheme/g,scheme).replace(/\$table/g,table)}`).join('\n') : ''}
            ORDER BY 
                ${_orderBy ?? "updated_at"} ${_orderDirection ?? "ASC"}
            LIMIT 
                :limit
            OFFSET
                :offset
            `, { useNullForMissing: true })(namedValues));
        if (result.rowCount < 0) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '561c1368-5626-5ae3-af8d-a153eb59d499' });

        // Return list
        return callbackAndReturn({ success: true, data: (id != null || result.rows.length == 1) && !forceAsList ? result.rows[0] : result.rows }, callback);
    } catch (e) {
        console.warn(e)
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
export async function pgSimpleGetLastUpdate({ scheme, table, id = null, filter = null, callback = null, client = null }: pgSimpleGetLastUpdateInterface): Promise<{ [index: string]: any }> {

    // Get function start time
    const start: [number, number] = process.hrtime();

    // Connect to PostgreSQL-Pool
    const _client = client ?? await pool.connect()

    try {

        // Get requested data
        const result = await _client.query(named.pg(`
            SELECT 
                ${scheme}.${table}.id, 
                FLOOR(EXTRACT(EPOCH FROM ${scheme}.${table}.created_at)) AS created_at,
                FLOOR(EXTRACT(EPOCH FROM ${scheme}.${table}.created_at)) AS updated_at
            FROM 
                ${scheme}.${table}
            WHERE TRUE
                ${id != null ? `AND ${scheme}.${table}.id = :id` : ''}
                ${filter != null ? Object.keys(filter).map((e, index) => `AND ${scheme}.${table}.${e} = :${e}`).join('\n') : ''}
            ORDER BY 
                updated_at DESC
            LIMIT 
                1
            `, { useNullForMissing: true })({
            id: id,
            limit: 1,
            ...(filter as { [index: string]: any; }),
        }));
        if (result.rowCount < 0) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: 'e7fd75b1-feb1-5080-9a6b-d9cb8ae4ad86' });
        if (result.rowCount > 1) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: 'bc4d5693-58ac-5cf3-9a02-fc069b693838' });

        // Return list
        return callbackAndReturn({ success: true, data: result.rows[0] }, callback);
    } catch (e) {
        console.warn(e)
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
}
export async function pgSimplePost({ scheme, table, keyValue = {}, callback = null, client = null }: pgSimplePostInterface): Promise<{ [index: string]: any }> {

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
                RETURNING *;
            `, [...Object.values(keyValue).map((element, index) => element)]) :
            await _client.query(`
                INSERT INTO ${scheme}.${table} DEFAULT VALUES
                RETURNING *;
            `);
        if (addResult.rowCount < 0) throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '923f61f0-a886-5274-83d1-f3ecd9f3fbe7' });

        // Return list
        return callbackAndReturn({ success: true, data: addResult.rows.length == 1 ? addResult.rows[0] : addResult.rows }, callback);
    } catch (e) {
        console.warn(e)

        // Rollback transaction
        if (!client) await _client.query('ROLLBACK');

        // Callback error
        throw new ErrorWithCodeAndMessage({ success: false, message: "Internal server error", error_code: '5b2aba0c-2c60-5f55-bb57-c4d0dbedd15a' });
    } finally {
        if (!client) _client.release()
        console.info('beeshift/functions/post [Execution time]: %dms', process.hrtime(start)[1] / 1000000)
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
export function isCalculableValue({ value, min = null, max = null }: IsCalculableValueType): { [index: string]: any } {
    if (value == null || (typeof value != "number" && typeof value != "string")) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid number or not calculable", error_code: 'f8a63c07-4c42-5219-ba65-579ce0ef05d1' });
    else if (typeof value == "string") {
        try {
            value = limitedMathCalculator(value);
        }
        catch (e) {
            throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid number or not calculable", error_code: '0f7eb8c5-a955-5bbd-9283-1732e2c16d8f' })
        }
    }
    if (value == NaN) throw new ErrorWithCodeAndMessage({ success: false, message: `Invalid number`, error_code: '7aa9b120-a539-570b-ab98-4d0698f294be' });
    if ((min != null && value < min) || (max != null && value > max)) throw new ErrorWithCodeAndMessage({ success: false, message: `Value not in range (${min != null ? `Min: ${min}` : ''}${min != null && max != null ? `, ` : ''}${max != null ? `Max: ${max}` : ''})`, error_code: '3414474c-096f-557a-96f1-506997cd9931' });
    return { success: true }
}

interface IsNumberType {
    value: any,
    min?: number | null,
    max?: number | null,
    isInteger?: boolean,
}
export function isNumber({ value, min = null, max = null, isInteger = false }: IsNumberType): { [index: string]: any } {
    if (value == null || (typeof value != "number" && typeof value != "string")) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid number", error_code: '2d316e51-be57-54b4-82c9-3f0cf53ddbf3' });
    else if (typeof value == "string") {
        try {
            value = parseFloat(value);
        }
        catch (e) {
            throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid number", error_code: '0c7b32bb-99b4-570b-8b44-5a32fa4caabd' })
        }
    }
    if (value == NaN) throw new ErrorWithCodeAndMessage({ success: false, message: `Invalid number`, error_code: 'b07a1972-97c8-55e3-8161-9a34e8bcdde5' });
    if (isInteger && !Number.isInteger(value)) throw new ErrorWithCodeAndMessage({ success: false, message: `Invalid number`, error_code: 'a7413008-9397-55b5-90e8-166eb2ef2cff' });
    if ((min != null && value < min) || (max != null && value > max)) throw new ErrorWithCodeAndMessage({ success: false, message: `Value not in range (${min != null ? `Min: ${min}` : ''}${min != null && max != null ? `, ` : ''}${max != null ? `Max: ${max}` : ''})`, error_code: '3414474c-096f-557a-96f1-506997cd9931' });
    return { success: true }
}

interface IsDate {
    value: String | Date,
}
export function isDate({ value }: IsDate): { [index: string]: any } {
    if (value == null || (typeof value != "string" && !(value instanceof Date))) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid date", error_code: '9b9a586b-33bb-5f01-9e9b-6b4b60943a15' });
    else if (typeof value == "string" && !moment(value, 'YYYY-MM-DD', true).isValid()) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid date", error_code: 'b8b8331b-0b75-503c-b4fc-7c6b8377382d' });
    return { success: true }
}

interface IsTime {
    value: String | number,
    withSecoonds?: boolean,
}
export function isTime({ value, withSecoonds = false }: IsTime): { [index: string]: any } {
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
export function isBoolean({ value }: IsBoolean): { [index: string]: any } {
    if (value == null || (typeof value != "string" && typeof value != "boolean")) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid boolean", error_code: '36c526fc-45c5-5f64-aeff-62cd23b9396d' });
    else if (typeof value == "string" && !(/^(?:TRUE|FALSE)$/i.test(value))) throw new ErrorWithCodeAndMessage({ success: false, message: "Invalid boolean", error_code: '9cd04962-a5f6-5850-accc-dd6a552a863f' });
    return { success: true }
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
export function convertToBoolean({ value }: ConvertToBoolean): boolean {
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

    constructor(result: { [index: string]: any }) {
        super(result.message);
        this.result = result;
    }
}
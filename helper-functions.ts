import { all, create } from "mathjs";
import moment from "moment";

//=====================================================================
//== Enums
//=====================================================================

export enum JoinType {
  JOIN = "JOIN",
  INNER_JOIN = "INNER JOIN",
  LEFT_JOIN = "LEFT JOIN",
  RIGHT_JOIN = "RIGHT JOIN",
  FULL_JOIN = "FULL JOIN",
  OUTER_JOIN = "OUTER JOIN",
  NATURAL_JOIN = "NATURAL JOIN",
  CROSS_JOIN = "CROSS JOIN",
  LEFT_OUTER_JOIN = "LEFT OUTER JOIN",
  RIGHT_OUTER_JOIN = "RIGHT OUTER JOIN",
  FULL_OUTER_JOIN = "FULL OUTER JOIN",
}

//=====================================================================
//== Types
//=====================================================================

export type Filter = {
  where: string;
  value?: { key: string; value: any };
  invert?: boolean;
};

interface JoinInterface {
  type: JoinType;
  from: string;
  on: string;
}
export class Join {
  type: JoinType;
  from: string;
  on: string;

  constructor({ type, from, on }: JoinInterface) {
    this.type = type;
    this.from = from;
    this.on = on;
  }

  toQuery() {
    return `${this.type} ${this.from} ON ${this.on}`;
  }
}

export type ValidationType = {
  name: string;
  type: "string" | "number" | "boolean" | "date-time" | "date" | "time" | "id";
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  allowedChars?: string;
  decimals?: number;
};

//=====================================================================
//== Functions
//=====================================================================

export function outputExecutionTime(fileName: string, functionName: string, executionTime: number) {
  //logging.info(fileName.replace((global as any).appRoot, "~") + ':' + functionName + ' [Execution time]: %dms', executionTime);
}

export function callbackAndReturn(data: { success: boolean; data: any }, callback: ((result: any) => any) | null) {
  if (callback) callback(data);
  return data;
}

export function isDebug() {
  return process.env.NODE_ENV !== "production";
}

//=====================================================================
//== Default-Validations
//=====================================================================

interface IsCalculableValueType {
  value: any;
  min?: number | null;
  max?: number | null;
}
export function isCalculableValue({ value, min = null, max = null }: IsCalculableValueType): { [index: string]: any } {
  if (value == null || (typeof value !== "number" && typeof value !== "string"))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid number or not calculable",
      error_code: "f8a63c07-4c42-5219-ba65-579ce0ef05d1",
    });
  if (typeof value === "string") {
    try {
      value = limitedMathCalculator(value);
    } catch (e) {
      throw new ErrorWithCodeAndMessage({
        success: false,
        message: "Invalid number or not calculable",
        error_code: "0f7eb8c5-a955-5bbd-9283-1732e2c16d8f",
      });
    }
  }
  if (Number.isNaN(value))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid number",
      error_code: "7aa9b120-a539-570b-ab98-4d0698f294be",
    });
  if ((min != null && value < min) || (max != null && value > max))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: `Value not in range (${min != null ? `Min: ${min}` : ""}${min != null && max != null ? ", " : ""}${max != null ? `Max: ${max}` : ""})`,
      error_code: "3414474c-096f-557a-96f1-506997cd9931",
    });
  return { success: true };
}

interface IsNumberType {
  value: any;
  min?: number | null;
  max?: number | null;
  isInteger?: boolean;
}
export function isNumber({ value, min = null, max = null, isInteger = false }: IsNumberType): { [index: string]: any } {
  if (value == null || (typeof value !== "number" && typeof value !== "string"))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid number",
      error_code: "2d316e51-be57-54b4-82c9-3f0cf53ddbf3",
    });
  if (typeof value === "string") {
    try {
      value = Number.parseFloat(value);
    } catch (e) {
      throw new ErrorWithCodeAndMessage({
        success: false,
        message: "Invalid number",
        error_code: "0c7b32bb-99b4-570b-8b44-5a32fa4caabd",
      });
    }
  }
  if (Number.isNaN(value))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid number",
      error_code: "b07a1972-97c8-55e3-8161-9a34e8bcdde5",
    });
  if (isInteger && !Number.isInteger(value))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid number",
      error_code: "a7413008-9397-55b5-90e8-166eb2ef2cff",
    });
  if ((min != null && value < min) || (max != null && value > max))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: `Value not in range (${min != null ? `Min: ${min}` : ""}${min != null && max != null ? ", " : ""}${max != null ? `Max: ${max}` : ""})`,
      error_code: "3414474c-096f-557a-96f1-506997cd9931",
    });
  return { success: true };
}

interface IsDate {
  value: string | Date;
}
export function isDate({ value }: IsDate): { [index: string]: any } {
  if (value == null || (typeof value !== "string" && !(value instanceof Date)))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid date",
      error_code: "9b9a586b-33bb-5f01-9e9b-6b4b60943a15",
    });
  if (typeof value === "string" && !moment(value, "YYYY-MM-DD", true).isValid())
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid date",
      error_code: "b8b8331b-0b75-503c-b4fc-7c6b8377382d",
    });
  return { success: true };
}

interface IsTime {
  value: string | number;
  withSecoonds?: boolean;
}
export function isTime({ value, withSecoonds = false }: IsTime): { [index: string]: any } {
  if (value == null || (typeof value !== "string" && typeof value !== "number"))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid time",
      error_code: "d441bb41-c585-527c-a884-29d90953d365",
    });
  if (typeof value === "string") {
    if (withSecoonds && !moment(value, "hh:mm:ss", true).isValid())
      throw new ErrorWithCodeAndMessage({
        success: false,
        message: "Invalid time",
        error_code: "fa231660-aecc-5cec-ab23-1f170cf8f40d",
      });
    if (!withSecoonds && !moment(value, "hh:mm", true).isValid())
      throw new ErrorWithCodeAndMessage({
        success: false,
        message: "Invalid time",
        error_code: "4c0d7354-526a-53fb-b3ce-625ceb3fb211",
      });
    value = withSecoonds ? moment(value, "hh:mm:ss", true).seconds() : moment(value, "hh:mm", true).minutes();
  }
  if (withSecoonds && (value < 0 || value >= 86400))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid time",
      error_code: "56d30c1d-7e07-5b0a-9bf4-fb3664c062df",
    });
  if (withSecoonds && (value < 0 || value >= 1440))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid time",
      error_code: "56d30c1d-7e07-5b0a-9bf4-fb3664c062df",
    });
  return { success: true };
}

interface IsBoolean {
  value: string | boolean;
}
export function isBoolean({ value }: IsBoolean): { [index: string]: any } {
  if (value == null || (typeof value !== "string" && typeof value !== "boolean"))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid boolean",
      error_code: "36c526fc-45c5-5f64-aeff-62cd23b9396d",
    });
  if (typeof value === "string" && !/^(?:TRUE|FALSE)$/i.test(value))
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid boolean",
      error_code: "9cd04962-a5f6-5850-accc-dd6a552a863f",
    });
  return { success: true };
}

interface Validate {
  value: any;
  rules: ValidationType;
}
export function validate({ value, rules }: Validate): { success: boolean; message?: string; error_code?: string } {
  if (rules.type === "string") {
    // Validate if required and value is null or empty string
    if (!rules.required && (value == null || value === "")) return { success: true };
    if (rules.required && (value == null || value === ""))
      return {
        success: false,
        message: `${rules.name} is required`,
        error_code: "4e17c1e7-aec6-5d7b-8d4d-3ac6e15c8520",
      };

    // Validate if value is a string or can be converted to a string
    if (value == null || (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean"))
      return {
        success: false,
        message: `${rules.name} must be a string`,
        error_code: "b7b5b5e1-5b1f-5b9f-8b5b-5e1b5b1f5b9f",
      };
    if (typeof value !== "string") value = value.toString();

    if (rules.min)
      return {
        success: false,
        message: `${rules.name} must be at least ${rules.min} characters`,
        error_code: "56d95835-e72c-51ac-ac19-fba0b5c481a3",
      };
    if (rules.max)
      return {
        success: false,
        message: `${rules.name} must be at most ${rules.max} characters`,
        error_code: "87e4cedd-a223-56c0-a8a1-bca16807a6d9",
      };
    if (rules.allowedChars && !new RegExp(`^[${rules.allowedChars}]+$`).test(value))
      return {
        success: false,
        message: `${rules.name} contains invalid characters`,
        error_code: "4c38141b-5436-59c5-a537-d9201ea50570",
      };
    if (rules.pattern && !new RegExp(rules.pattern).test(value))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "8a0cd2ba-2354-5a23-b4da-5ed0c74ab2fd",
      };

    return { success: true };
  }
  if (rules.type === "number") {
    // Validate if required and value is null or empty string
    if (!rules.required && (value == null || (typeof value === "string" && value === ""))) return { success: true };
    if (rules.required && (value == null || (typeof value === "string" && value === "")))
      return {
        success: false,
        message: `${rules.name} is required`,
        error_code: "72773c6d-52a5-5e7a-88f9-3ce0a005f0f6",
      };

    // Validate if value is a number or a string that can be converted to a number
    if (value == null || (typeof value !== "number" && typeof value !== "string"))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "1fb16877-b708-5217-a5a0-044c3564b614",
      };
    if (typeof value === "string" && !/^-?\d*(\.\d+)?$/.test(value))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "eb718877-e6bb-5754-9ef0-c281f3d78273",
      };
    value = Number(value);

    if (rules.min && value < rules.min)
      return {
        success: false,
        message: `${rules.name} must be at least ${rules.min}`,
        error_code: "f34944e2-3154-5bd4-8897-3c76ac65086e",
      };
    if (rules.max && value > rules.max)
      return {
        success: false,
        message: `${rules.name} must be at most ${rules.max}`,
        error_code: "124a10e9-3352-5cac-85e6-c4bd1349284f",
      };
    if (rules.decimals) {
      const decimals = value.toString().split(".")[1];
      if (decimals && decimals.length > rules.decimals)
        return {
          success: false,
          message: `${rules.name} must have at most ${rules.decimals} decimals`,
          error_code: "107bfb13-3b2a-5737-be12-a098b1c4f5e2",
        };
    }

    return { success: true };
  }
  if (rules.type === "date-time") {
    // Formmat must be YYYY-MM-DDTHH:mm:ss.sssZ for example 22023-03-28T14:56:23.660Z
    // Validate if required and value is null or empty string
    if (!rules.required && (value == null || (typeof value === "string" && value === ""))) return { success: true };
    if (rules.required && (value == null || (typeof value === "string" && value === "")))
      return {
        success: false,
        message: `${rules.name} is required`,
        error_code: "b74c1bc1-4a57-582a-b42f-e4dd382540c2",
      };

    // Check if value is moment object
    if (value instanceof moment) {
      if (!(value as moment.Moment).isValid()) {
        return {
          success: false,
          message: `${rules.name} is invalid`,
          error_code: "810ff853-bac8-5ba7-a56f-d0cc1f8bff77",
        };
      }
      value = (value as moment.Moment).toDate();
    }

    // Validate if value is a date or a string that can be converted to timestamp (number)
    if (value == null || (typeof value !== "string" && !(value instanceof Date)))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "e3bc3352-9f36-53c5-960f-db53b436246a",
      };
    if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "e3bc3352-9f36-53c5-960f-db53b436246a",
      };
    if (typeof value === "string") value = new Date(value);

    if (rules.min && value < rules.min)
      return {
        success: false,
        message: `${rules.name} must be at least ${rules.min}`,
        error_code: "f34944e2-3154-5bd4-8897-3c76ac65086e",
      };
    if (rules.max && value > rules.max)
      return {
        success: false,
        message: `${rules.name} must be at most ${rules.max}`,
        error_code: "124a10e9-3352-5cac-85e6-c4bd1349284f",
      };

    return { success: true };
  }
  if (rules.type === "date") {
    // Validate if required and value is null or empty string
    if (!rules.required && (value == null || (typeof value === "string" && value === ""))) return { success: true };
    if (rules.required && (value == null || (typeof value === "string" && value === "")))
      return {
        success: false,
        message: `${rules.name} is required`,
        error_code: "b74c1bc1-4a57-582a-b42f-e4dd382540c2",
      };

    // Check if value is moment object
    if (value instanceof moment) {
      if (!(value as moment.Moment).isValid()) {
        return {
          success: false,
          message: `${rules.name} is invalid`,
          error_code: "810ff853-bac8-5ba7-a56f-d0cc1f8bff77",
        };
      }
      value = (value as moment.Moment).toDate();
    }

    // Validate if value is a date or a string that can be converted to timestamp (number)
    if (value == null || (typeof value !== "string" && !(value instanceof Date)))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "e3bc3352-9f36-53c5-960f-db53b436246a",
      };
    if (
      typeof value === "string" &&
      !/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)
    )
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "e3bc3352-9f36-53c5-960f-db53b436246a",
      };

    return { success: true };
  }
  if (rules.type === "time") {
    // Validate if required and value is null or empty string
    if (!rules.required && (value == null || (typeof value === "string" && value === ""))) return { success: true };
    if (rules.required && (value == null || (typeof value === "string" && value === "")))
      return {
        success: false,
        message: `${rules.name} is required`,
        error_code: "29f2b4a6-4e17-5802-8c03-25130806eac7",
      };

    // Check if value is moment object
    if (value instanceof moment) {
      if (!(value as moment.Moment).isValid()) {
        return {
          success: false,
          message: `${rules.name} is invalid`,
          error_code: "13d5557e-69f4-5ff3-992e-c80218935a15",
        };
      }
      value = (value as moment.Moment).toDate();
    }

    // Validate if value is a date or a string that can be converted to timestamp (number)
    if (value == null || (typeof value !== "string" && !(value instanceof Date)))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "e51ad5073-899e-5ee9-abb6-d92a96e3e31f",
      };
    if (typeof value === "string" && !/^\d{2}:\d{2}:\d{2}$/.test(value))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "07219201-9b2f-5240-9b17-793914c8b76e",
      };
    //else if (typeof value == "string") value = new Date(value).getTime();
    //else value = value.getTime();

    return { success: true };
  }
  if (rules.type === "boolean") {
    // Validate if required and value is null or empty string
    if (!rules.required && (value == null || (typeof value === "string" && value === ""))) return { success: true };
    if (rules.required && (value == null || (typeof value === "string" && value === "")))
      return {
        success: false,
        message: `${rules.name} is required`,
        error_code: "b4e06719-384e-5130-87f0-1bf12307259a",
      };

    // Validate if value is a boolean or a string that can be converted to boolean
    if (value == null || (typeof value !== "boolean" && typeof value !== "string"))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "418539e4-0474-5125-b4aa-62d92dfb7230",
      };
    if (typeof value === "string" && !/^(true|false)$/.test(value))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "250d6a46-6860-55f1-b04c-bfb0a37db9cb",
      };

    return { success: true };
  }
  if (rules.type === "id") {
    // Validate if required and value is null or empty string
    if (!rules.required && (value == null || (typeof value === "string" && value === ""))) return { success: true };
    if (rules.required && (value == null || (typeof value === "string" && value === "")))
      return {
        success: false,
        message: `${rules.name} is required`,
        error_code: "784db3b0-eca0-5c61-8db9-db6f3a02353b",
      };

    // Validate if value is a string
    if (value == null || typeof value !== "string")
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "7366c0c5-a861-5b0b-8aeb-0b7e2431016d",
      };

    // Validate if value is a valid id (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))
      return {
        success: false,
        message: `${rules.name} is invalid`,
        error_code: "ee6797a3-9ade-5171-b9ca-325f66dd9db4",
      };

    return { success: true };
  }

  throw new Error(`Type ${rules.type} is not supported`);
}

interface ValidateAll {
  // Data as list of { name, value, type, rules }
  data: any;
}
export function validateAll({ data }: ValidateAll): { success: boolean; message?: string; error_code?: string } {
  for (const key in data) {
    const value = data[key];
    if (value == null) continue; // Skip if value is null
    if (value.rules == null && value.type == null) continue; // Skip if rules and type are null
    const validation = validate({
      value: value.value,
      rules: value.rules ? value.rules : { name: value.name, type: value.type },
    });
    if (!validation.success) return validation;
  }
  return { success: true };
}

interface Convert {
  value: any;
  type: "string" | "number" | "date-time" | "date" | "time" | "boolean";
  rules?: any;
}
export function convert({ value, type, rules = {} }: Convert): any {
  // Return null if value is null and not required
  if (!rules.required && value == null) return null;

  // Validate value
  const validation = validate({ value, rules });
  if (!validation.success) throw new Error(validation.message);

  if (type === "string") {
    // If not required and value is null or empty string, return null
    if (!rules.required && typeof value === "string" && value === "") return null;

    // Empty string if value is null
    if (value == null) value = "";

    // Convert if value is a number or a boolean
    if (typeof value === "number" || typeof value === "boolean") value = value.toString();

    // Trim value
    value = value.trim();

    // Convert to uppercase
    if (rules.uppercase) value = value.toUpperCase();

    // Convert to lowercase
    if (rules.lowercase) value = value.toLowerCase();

    return value;
  }
  if (type === "number") {
    // Convert if value is a string
    if (typeof value === "string") {
      if (rules.step === 1) value = Number.parseInt(value);
      else value = Number.parseFloat(value);
    }

    return value;
  }
  if (type === "date-time") {
    // Return as date object

    // Convert if value is a string
    if (typeof value === "string") value = new Date(value);
    else value = new Date(value);

    return value;
  }
  if (type === "date") {
    // Return as date object

    // Convert if value is a string
    if (typeof value === "string") value = new Date(value);
    else value = new Date(value);

    return value;
  }
  if (type === "time") {
    // Return as date object

    // Convert if value is a string
    if (typeof value === "string") value = new Date(value);
    else value = new Date(value);

    return value;
  }
  if (type === "boolean") {
    // Convert if value is a string
    if (typeof value === "string") value = value === "true";

    return value;
  }
  throw new Error(`Type ${type} is not supported`);
}

//=====================================================================
//== MathJS
//=====================================================================

const math = create(all);
math.import(
  {
    import: () => {
      throw new Error("Function import is disabled");
    },
    createUnit: () => {
      throw new Error("Function createUnit is disabled");
    },
    //'evaluate': function () { throw new Error('Function evaluate is disabled') },
    //'parse': function () { throw new Error('Function parse is disabled') },
    simplify: () => {
      throw new Error("Function simplify is disabled");
    },
    derivative: () => {
      throw new Error("Function derivative is disabled");
    },
  },
  { override: true },
);
const limitedMathCalculator = math.evaluate;
export { limitedMathCalculator };

//=====================================================================
//== Default-Converts
//=====================================================================

interface ConvertToBoolean {
  value: string | boolean;
}
export function convertToBoolean({ value }: ConvertToBoolean): boolean {
  if (typeof value === "string") {
    if (/^TRUE$/i.test(value)) return true;
    if (/^FALSE$/i.test(value)) return false;
    throw new ErrorWithCodeAndMessage({
      success: false,
      message: "Invalid boolean",
      error_code: "8c55912d-9ecb-5933-a37f-6b1041fe070a",
    });
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

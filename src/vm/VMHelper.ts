import { Heap } from "./Heap";
import { error } from "../Utils";

export function apply_binop(op: string, v2: any, v1: any, heap: Heap): any {
    const binop_microcode = {
        "|": (x, y) => x || y,
        "&": (x, y) => x && y,
        "||": (x, y) => x || y,
        "&&": (x, y) => x && y,
        "+": (x, y) => x + y,
        "*": (x, y) => x * y,
        "-": (x, y) => x - y,
        "/": (x, y) => {
            if (y === 0) {
                error("Division by zero");
            }
            return x / y;
        },
        "%": (x, y) => x % y,
        "<": (x, y) => x < y,
        "<=": (x, y) => x <= y,
        ">=": (x, y) => x >= y,
        ">": (x, y) => x > y,
        "==": (x, y) => x === y,
        "!=": (x, y) => x !== y,
    };

    const fn = binop_microcode[op];
    if (!fn) {
        error("Unknown binary operator: " + op);
    }
    // Convert addresses -> TS values
    const leftVal = heap.address_to_TS_value(v1);
    const rightVal = heap.address_to_TS_value(v2);
    const result = fn(leftVal, rightVal);

    return heap.TS_value_to_address(result);
}

export function apply_unop(op: string, v: any, heap: Heap): any {
    const unop_microcode = {
        "-": (x) => -x,
        "!": (x) =>
            typeof x === "boolean"
                ? !x
                : error("! expects boolean, found: " + x),
    };

    const fn = unop_microcode[op];
    if (!fn) {
        error("Unknown unary operator: " + op);
    }
    // Convert address -> TS value
    const val = heap.address_to_TS_value(v);
    const result = fn(val);
    return heap.TS_value_to_address(result);
}

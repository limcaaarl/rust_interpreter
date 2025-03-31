import { isBooleanObject } from "util/types";
import { findNodeByTag } from "./compiler/CompilerHelper";

export class Pair {
    constructor(public head: any, public tail: any) { }
}

export function head(p: Pair): any {
    return p.head;
}

export function tail(p: Pair): any {
    return p.tail;
}

export function pair(head: any, tail: any): Pair {
    return new Pair(head, tail);
}

export function error(message: string): never {
    throw new Error(message);
}

export function is_null(env: Pair): boolean {
    return env === null;
}

export function scan(node: any): any[] {
    // Base case: if the node is null or undefined
    if (!node) return [];

    // If this is a LetStatement or Function_, extract its symbol
    if ((node.tag === "LetStatement" || node.tag === "Function_") && node.children && node.children.length > 0) {
        // The identifier's actual value is in the child Terminal node of the first Identifier node
        const identifier = findNodeByTag(node, "Identifier");
        const terminal = identifier && findNodeByTag(identifier, "Terminal");
        if (terminal && terminal.val) {
            return [terminal.val];
        }
        return [];
    }

    // If this node has children, recursively scan them
    if (node.children && node.children.length > 0) {
        return node.children.reduce((acc, child) => {
            return acc.concat(scan(child));
        }, []);
    }

    // If none of the above, return empty array
    return [];
}

export function extend(xs: string[], vs: any[], e: Pair): Pair {
    if (vs.length > xs.length) error('too many arguments')
    if (vs.length < xs.length) error('too few arguments')
    const new_frame = {}
    for (let i = 0; i < xs.length; i++)
        new_frame[xs[i]] = vs[i]
    return pair(new_frame, e)
}

export function assign_value(x: string, v: any, e: Pair): void {
    if (is_null(e))
        error('unbound name: ' + x)
    if (head(e).hasOwnProperty(x)) {
        head(e)[x] = v
    } else {
        assign_value(x, v, tail(e))
    }
}

export function lookup(symbol: string, e: Pair): any {
    if (is_null(e))
        error('unbound name: ' + symbol)
    if (head(e).hasOwnProperty(symbol)) {
        const v = head(e)[symbol]
        if (is_unassigned(v))
            error('unassigned name: ' + symbol)
        return v
    }
    return lookup(symbol, tail(e))
}

// At the start of executing a block, local 
// variables refer to unassigned values.
export const UNASSIGNED = { tag: 'unassigned' }

export function is_unassigned(v: any): boolean {
    return v !== null &&
        typeof v === "object" &&
        v.hasOwnProperty('tag') &&
        v.tag === 'unassigned'
}

// v2 is popped before v1
export function apply_binop(op: string, v2: any, v1: any): any {
    const binop_microcode = {
        '+': (x, y) => x + y,
        '*': (x, y) => x * y,
        '-': (x, y) => x - y,
        '/': (x, y) => x / y,
        '%': (x, y) => x % y,
        '<': (x, y) => x < y,
        '<=': (x, y) => x <= y,
        '>=': (x, y) => x >= y,
        '>': (x, y) => x > y,
        '==': (x, y) => x === y,
        '!=': (x, y) => x !== y
    };

    return binop_microcode[op](v1, v2);
}

export function is_boolean(x: any): boolean {
    return x === true || x === false;
}

export function apply_unop(op: string, v: any): any {
    const unop_microcode = {
        '-': x => - x,
        '!': x => is_boolean(x)
            ? !x
            : error('! expects boolean, found: ' + x)
    };
    return unop_microcode[op](v);
}
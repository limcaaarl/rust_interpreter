import { findNodeByTag } from "./compiler/CompilerHelper";
import { CharStream, CommonTokenStream } from "antlr4ng";
import { RustLexer } from "./parser/src/RustLexer";
import { RustParser } from "./parser/src/RustParser";
import { Compiler } from "./compiler/Compiler";

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
    if (vs.length > xs.length) error('Too many arguments')
    if (vs.length < xs.length) error('Too few arguments')
    const new_frame = {}
    for (let i = 0; i < xs.length; i++)
        new_frame[xs[i]] = vs[i]
    return pair(new_frame, e)
}

export function assign_value(x: string, v: any, e: Pair): void {
    if (is_null(e))
        error('Unbound name: ' + x)
    if (head(e).hasOwnProperty(x)) {
        head(e)[x] = v
    } else {
        assign_value(x, v, tail(e))
    }
}

export function lookup(symbol: string, e: Pair): any {
    if (is_null(e))
        error('Unbound name: ' + symbol)
    if (head(e).hasOwnProperty(symbol)) {
        const v = head(e)[symbol]
        if (is_unassigned(v))
            error('Unassigned name: ' + symbol)
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

export function generateJsonAst(code: string) {
    // Create the lexer and parser
    const inputStream = CharStream.fromString(code);
    const lexer = new RustLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new RustParser(tokenStream);
    const compiler = new Compiler();

    // Parse the input
    const tree = parser.crate();
    const astJson = compiler.astToJson(tree);

    return astJson
}

// To check reference types as objects are compared by reference, not by value
export function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true; // Same reference or primitive value

    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false; // One is not an object or is null
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false; // Different number of keys

    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false; // Key mismatch or value mismatch
        }
    }

    return true;
}
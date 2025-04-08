import { ParserRuleContext, ParseTree } from "antlr4ng";
import { Instruction } from "./Instruction";
import { LiteralExpressionContext } from "../parser/src/RustParser";

// Recursively search for the first node with a given tag.
export function findNodeByTag(ast: any, tag: string): any {
    if (ast.tag === tag) return ast;
    if (ast.children) {
        for (const child of ast.children) {
            const found = findNodeByTag(child, tag);
            if (found) return found;
        }
    }
    return null;
}

// Extract a terminal value from a node, assuming it eventually contains a Terminal node.
export function extractTerminalValue(ast: any): any {
    if (ast.tag === "Terminal") {
        return ast.val;
    }
    if (ast.children) {
        for (const child of ast.children) {
            const val = extractTerminalValue(child);
            if (val) return val;
        }
    }
    return "";
}

// Assume extractType is similar to extractTerminalValue but could be more complex.
export function extractType(ast: any): string {
    // Here, we search for a Terminal inside the Type_ subtree.
    return extractTerminalValue(ast);
}

export function displayInstructions(instructions: Instruction[]): void {
    console.log("========== Instructions ==========");
    for (const instruction of instructions) {
        console.log(instruction);
    }
}

export function getLiteralVal(node: LiteralExpressionContext) {
    if (node.INTEGER_LITERAL()) {
        return parseInt(node.INTEGER_LITERAL().getText(), 10);
    } else if (node.KW_TRUE()) {
        return true;
    } else if (node.KW_FALSE()) {
        return false;
    } else if (node.FLOAT_LITERAL()) {
        return parseFloat(node.FLOAT_LITERAL().getText());
    } else if (node.STRING_LITERAL()) {
        return JSON.parse(node.getText());
    }
}

export function getNodeType(node: ParserRuleContext): string {
    return node.constructor.name.replace("Context", "");
}

export interface FunctionParam {
    name: string;
    type: string;
}

export function getReturnType(ast: any): string {
    const returnNode = findNodeByTag(ast, "FunctionReturnType");
    if (!returnNode) return "";
    const typeNode = findNodeByTag(returnNode, "Type_");
    
    return typeNode ? extractTerminalValue(typeNode) : "";
}

export function getFunctionParams(ast: any): FunctionParam[] {
    const params: FunctionParam[] = [];
    const paramsNode = findNodeByTag(ast, "FunctionParameters");
    if (!paramsNode || !paramsNode.children) return params;
    
    for (const child of paramsNode.children) {
        if (child.tag !== "FunctionParam") continue;
        
        const identifierNode = findNodeByTag(child, "Identifier");
        const typeNode = findNodeByTag(child, "Type_");
        
        if (identifierNode && typeNode) {
            const name = extractTerminalValue(identifierNode);
            const typeStr = extractType(typeNode);
            params.push({ name, type: typeStr });
        }
    }
    
    return params;
}

export function compile_time_environment_position(env, x) {
    let frame_index = env.length - 1; // start at the last frame
    while (frame_index >= 0) {
        const idx = value_index(env[frame_index], x);
        if (idx !== -1) {
            return [frame_index, idx];
        }
        frame_index--;
    }
}

export function value_index(frame, x) {
    for (let i = 0; i < frame.length; i++) {
        if (frame[i] === x) return i;
    }
    return -1;
}

export function compile_time_environment_extend (vs, e) {
    const newEnv = [...e];
    newEnv.push(vs);
    return newEnv;
}
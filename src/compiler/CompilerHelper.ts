import { ParserRuleContext } from "antlr4ng";
import { Instruction } from "./Instruction";
import { LiteralExpressionContext } from "../parser/src/RustParser";
import {
    BOOL_TYPE,
    CHAR_TYPE,
    F32_TYPE,
    I32_TYPE,
    RustType,
    STR_TYPE,
    UNIT_TYPE,
} from "../typechecker/Types";
import { error } from "../Utils";
import { Backup, Borrow, VariableInfo } from "./Variable";

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

export function extractTerminalValues(ast: any, isCheckingBorrowship: boolean): any[] {
    const values: any[] = [];
    if (ast.tag === "Terminal") {
        values.push(ast.val);
    } else if (ast.children) {
        for (const child of ast.children) {
            if (isCheckingBorrowship && child.tag == "BorrowExpression") {
                break; // ignore borrows
            }
            values.push(...extractTerminalValues(child, isCheckingBorrowship));
        }
    }
    return values;
}

export function extractType(typeNode: any): RustType {
    const terminalVals = extractTerminalValues(typeNode, false);
    const typeStr = terminalVals.join(" ");
    return parseTypeString(typeStr);
}
export function parseTypeString(typeStr: string): RustType {
    // Check for reference types
    if (typeStr.startsWith("&")) {
        let mutable = false;
        let targetTypeStr = typeStr.substring(2); // Remove '& '

        // Check for mut keyword
        if (targetTypeStr.startsWith("mut ")) {
            mutable = true;
            targetTypeStr = targetTypeStr.substring(4); // Remove 'mut '
        }

        // Parse the target type
        const targetType = parseTypeString(targetTypeStr);
        return { kind: "reference", targetType, mutable };
    }

    // Handle primitive types
    switch (typeStr) {
        case "i32":
            return I32_TYPE;
        case "f32":
            return F32_TYPE;
        case "bool":
            return BOOL_TYPE;
        case "str":
            return STR_TYPE;
        case "char":
            return CHAR_TYPE;
        default:
            return UNIT_TYPE;
    }
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
    } else if (node.CHAR_LITERAL()) {
        return node.getText().replaceAll("'", "");
    }
}

export function getLiteralType(node: LiteralExpressionContext): string {
    if (node.INTEGER_LITERAL()) {
        return "i32";
    } else if (node.KW_TRUE() || node.KW_FALSE()) {
        return "bool";
    } else if (node.FLOAT_LITERAL()) {
        return "f32";
    } else if (node.STRING_LITERAL()) {
        return "str";
    } else if (node.CHAR_LITERAL()) {
        return "char";
    }
}

export function getNodeType(node: ParserRuleContext): string {
    return node.constructor.name.replace("Context", "");
}

export interface FunctionParam {
    name: string;
    type: RustType;
}

export function getReturnType(ast: any): string {
    const returnNode = findNodeByTag(ast, "FunctionReturnType");
    if (!returnNode) return "";
    const typeNode = findNodeByTag(returnNode, "Type_");

    return typeNode ? extractTerminalValue(typeNode) : "";
}

export function getFunctionParams(functionNode: any): FunctionParam[] {
    const params: FunctionParam[] = [];
    const paramsNode = findNodeByTag(functionNode, "FunctionParameters");
    if (!paramsNode || !paramsNode.children) return params;

    for (const child of paramsNode.children) {
        if (child.tag !== "FunctionParam") continue;

        if (!paramsAreTyped(child)) {
            const funcName = extractTerminalValue(
                findNodeByTag(functionNode, "Identifier")
            );
            error(
                `Function ${funcName} has parameters that are not properly typed`
            );
        }

        const identifierNode = findNodeByTag(child, "Identifier");
        const typeNode = findNodeByTag(child, "Type_");

        if (identifierNode && typeNode) {
            const name = extractTerminalValue(identifierNode);
            const type = extractType(typeNode);
            params.push({ name, type: type });
        }
    }

    return params;
}

function paramsAreTyped(functionParamNode: any): boolean {
    const patternNode = findNodeByTag(
        functionParamNode,
        "FunctionParamPattern"
    );
    if (!patternNode || !(patternNode.children?.length === 3)) {
        return false;
    }
    return true;
}

export function compile_time_environment_position(env, x): [number, number] {
    let frame_index = env.length - 1; // start at the last frame
    while (frame_index >= 0) {
        const idx = value_index(env[frame_index], x);
        if (idx !== -1) {
            return [frame_index, idx];
        }
        frame_index--;
    }

    return undefined;
}

export function value_index(frame, x) {
    for (let i = 0; i < frame.length; i++) {
        if (frame[i].name === x) return i;
    }
    return -1;
}

export function compile_time_environment_extend(vs, e) {
    const newFrame: VariableInfo[] = vs.map((v) => ({
        name: v,
        ownsVal: true,
        borrow: Borrow.None,
    }));
    const newEnv = [...e];
    newEnv.push(newFrame);
    return newEnv;
}

// Ownership Borrow
export function checkVarUsage(ce, varName) {
    const pos = compile_time_environment_position(ce, varName);
    if (!pos) {
        throw new Error(`Variable '${varName}' is not declared.`);
    }
    const varInfo: VariableInfo = ce[pos[0]][pos[1]];
    if (varInfo.ownsVal === false) {
        throw new Error(
            `Variable '${varName}' has been moved and cannot be used.`
        );
    }
}

export function markVarMoved(env, varName: string): void {
    const [frameIndex, varIndex] = compile_time_environment_position(
        env,
        varName
    );
    env[frameIndex][varIndex].ownsVal = false;
}

export function checkBorrow(ce, position, symVal, isMutable) {
    // the variable being borrowed
    const variableInfo: VariableInfo = ce[position[0]][position[1]];

    if (isMutable) {
        // mutable borrow
        // can only have 1 borrower
        if (variableInfo.borrow == Borrow.Immutable) {
            throw new Error(
                `Cannot borrow '${symVal}' as mutable because it is also borrowed as ${variableInfo.borrow}.`
            );
        } else if (variableInfo.borrow == Borrow.Mutable) {
            throw new Error(
                `Cannot borrow '${symVal}' as mutable more than once`
            );
        }
        variableInfo.borrow = Borrow.Mutable;
    } else {
        // immutable borrow
        if (variableInfo.borrow === Borrow.Mutable) {
            throw new Error(
                `Cannot borrow '${symVal}' as immutable because it is also borrowed as mutable.`
            );
        }
        if (variableInfo.borrow === Borrow.None) {
            variableInfo.borrow = Borrow.Immutable;
            variableInfo.immCount = 1;
        } else if (variableInfo.borrow === Borrow.Immutable) {
            variableInfo.immCount = (variableInfo.immCount || 0) + 1;
        }
    }
}

export function backupEnv(env: VariableInfo[][]): Backup {
    const backup: Backup = new Map();
    for (let i = 0; i < env.length; i++) {
        for (const varInfo of env[i]) {
            backup.set(varInfo.name, {
                borrow: varInfo.borrow,
                ownsVal: varInfo.ownsVal,
                immCount: varInfo.immCount || 0,
            });
        }
    }
    return backup;
}

export function restoreEnv(env: VariableInfo[][], backup: Backup): void {
    for (let i = 0; i < env.length; i++) {
        for (const varInfo of env[i]) {
            const saved = backup.get(varInfo.name);
            if (saved !== undefined) {
                varInfo.borrow = saved.borrow;
                varInfo.immCount = saved.immCount;
            }
        }
    }
}

export function usesVariable(ast: any, varName: string): boolean {
    if (!ast) return false;
    if (ast.tag === "PathExpression_") {
        const name = extractTerminalValue(ast);
        if (name === varName) return true;
    }
    if (ast.children) {
        return ast.children.some((child: any) => usesVariable(child, varName));
    }
    return false;
}

export function generateDropInstructions(frame: any[], frameIdx, resultIdx, preserveReturnValue): Instruction[] {
    const dropInstrs: Instruction[] = [];
    for (let i = 0; i < frame.length; i++) {
        // skip the return values that is marked as preserveReturnValue, which indicates that it's being assigned to some var x = return();
        let skipReturn = preserveReturnValue && resultIdx.some(([resFrame, resSlot]) => resFrame === frameIdx && resSlot === i);
        // skip those variables with borrowers
        let isBorrowed = frame[i].borrow != Borrow.None;

        // skip those values that are still owned
        if (frame[i].ownsVal && !skipReturn && !isBorrowed) {
            // console.log("Frame being dropped: " + JSON.stringify(frame[i]) + " pos: " + frameIdx, i)
            dropInstrs.push({ tag: "DROP", pos: [frameIdx, i] });
        }
    }
    return dropInstrs;
}
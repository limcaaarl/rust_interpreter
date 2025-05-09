import { ParseTree, ParserRuleContext, TerminalNode } from "antlr4ng";
import {
    findNodeByTag,
    extractTerminalValue,
    getLiteralVal,
    getNodeType,
    getFunctionParams,
    getReturnType,
    compile_time_environment_position,
    compile_time_environment_extend,
    getLiteralType,
    checkBorrow,
    backupEnv,
    restoreEnv,
    checkVarUsage,
    extractTerminalValues,
    generateDropInstructions,
} from "./CompilerHelper";
import { Instruction } from "./Instruction";
import { scan } from "../Utils";
import { LiteralExpressionContext } from "../parser/src/RustParser";
import { TypeChecker } from "../typechecker/TypeChecker";

let instructions: Instruction[] = [];
let wc = 0;
let mainAddr = -1;

const global_compile_environment = []

export class Compiler {
    private typeChecker: TypeChecker = new TypeChecker();
    private resultIdx: [number, number][] = [];
    public astToJson(node: ParseTree): any {
        if (node instanceof TerminalNode) {
            if (node.parent instanceof LiteralExpressionContext) {
                return {
                    tag: "Terminal",
                    val: getLiteralVal(node.parent),
                    type: getLiteralType(node.parent),
                };
            } else {
                return {
                    tag: "Terminal",
                    val: node.getText(),
                };
            }
        } else if (node instanceof ParserRuleContext) {
            const result: any = {
                tag: getNodeType(node),
                children: [],
            };
            for (let i = 0; i < node.getChildCount(); i++) {
                result.children.push(this.astToJson(node.getChild(i)));
            }
            return result;
        }
        return null;
    }

    private compile(ast: any, ce: any, isCheckOwnership: boolean, preserveReturnValue: boolean): void {
        // console.log(ast.tag);
        // console.log(ce);
        switch (ast.tag) {
            case "LetStatement": {
                const letNameNode = findNodeByTag(ast, "Identifier");
                const letName = extractTerminalValue(letNameNode);

                // set LHS to be the owner
                const pos = compile_time_environment_position(ce, letName);
                ce[pos[0]][pos[1]].ownsVal = true;

                // Compilation of RHS will lead to RHS being checked if it's owned or not in path expression
                // so we set true here in the arguments this.compile()
                // Compile the right hand side of the '='
                const typeNode = findNodeByTag(ast, "Type_");

                // If type annotation exists
                if (typeNode) {
                    this.compile(ast.children[5], ce, true, preserveReturnValue);
                } else {
                    this.compile(ast.children[3], ce, true, preserveReturnValue);
                }

                instructions[wc++] = {
                    tag: "ASSIGN",
                    pos: pos,
                };

                // Clear the assigned value from OS
                instructions[wc++] = { tag: "POP" };
                break;
            }
            case "LiteralExpression": {
                if (ast.children && ast.children.length > 0) {
                    const term = ast.children[0];
                    instructions[wc++] = {
                        tag: "LDC",
                        val: term.val,
                    };
                }
                break;
            }
            case "PathExpression_": {
                const symVal = extractTerminalValue(ast);

                // Only let, assignments, implicit returns, and function calls will check for ownership
                if (isCheckOwnership) {
                    checkVarUsage(ce, symVal);

                    const position = compile_time_environment_position(
                        ce,
                        symVal
                    );

                    // move ownership for things like x = y;
                    // we do not move ownership for implicit returns
                    if (!this.resultIdx.some(([resFrame, resSlot]) => resFrame === position[0] && resSlot === position[1])) {
                        ce[position[0]][position[1]].ownsVal = false;
                    }
                }

                instructions[wc++] = {
                    tag: "LD",
                    sym: symVal,
                    pos: compile_time_environment_position(ce, symVal),
                };
                break;
            }
            case "CallExpression": {
                this.compileChildren(ast, ce, isCheckOwnership, preserveReturnValue);
                const callParamsNode = findNodeByTag(ast, "CallParams");

                // all variables passed as arguments will have its ownership transferred to the arguments of the function
                let paramNames = callParamsNode ? extractTerminalValues(callParamsNode, true) : [];

                paramNames.forEach((name) => {
                    if (name !== "," && typeof name === "string") {
                        const pos = compile_time_environment_position(ce, name);
                        if (pos) ce[pos[0]][pos[1]].ownsVal = false;
                    }
                });
                instructions[wc++] = {
                    tag: "CALL",
                    arity: callParamsNode ? Math.floor(callParamsNode.children.length / 2) + 1 : 0,
                };
                break;
            }
            case "Function_": {
                const funcName = extractTerminalValue(
                    findNodeByTag(ast, "Identifier")
                );

                const funcParams = getFunctionParams(ast);
                const paramNames = funcParams.map((param) => param.name);
                instructions[wc++] = {
                    tag: "LDF",
                    arity: funcParams.length,
                    retType: getReturnType(ast),
                    addr: wc + 1,
                };
                const goto_wc = wc++;
                instructions[goto_wc] = { tag: "GOTO", addr: -1 };

                // Params are set to be the owner of the passed values by default
                const extended_ce = compile_time_environment_extend(
                    paramNames,
                    ce,
                );

                const funcPos = compile_time_environment_position(
                    extended_ce,
                    funcName
                )

                if (funcName == "main" || ce[funcPos[0]][funcPos[1]].ownsVal == false) {
                    // a function is set to !ownsVal if it's being assigned to something let x = foo();
                    // in this case, we preserve the return value and ensure that it's not dropped
                    mainAddr = wc;
                    preserveReturnValue = true;
                }
                
                this.compile(
                    findNodeByTag(ast, "BlockExpression"),
                    extended_ce,
                    false,
                    preserveReturnValue
                );

                const frameIdx = extended_ce.length - 1;
                const localFrame = extended_ce[frameIdx];
                const dropInstructions = generateDropInstructions(localFrame, frameIdx, this.resultIdx, preserveReturnValue);
                dropInstructions.forEach(instr => {
                  instructions[wc++] = instr;
                });

                instructions[wc++] = { tag: "RESET" };
                instructions[goto_wc].addr = wc;
                instructions[wc++] = {
                    tag: "ASSIGN",
                    pos: funcPos,
                };
                instructions[wc++] = { tag: "POP" };
                break;
            }
            case "ReturnExpression": {
                // Tail call not supported yet

                // compile the rest of the expression
                for (let i = 1; i < ast.children.length; i++) {
                    this.compile(ast.children[i], ce, false, preserveReturnValue);
                }
                instructions[wc++] = { tag: "RESET" };
                break;
            }
            case "LazyBooleanExpression": {
                this.compile(ast.children[0], ce, false, preserveReturnValue); // left
                this.compile(ast.children[2], ce, false, preserveReturnValue); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "ComparisonExpression": {
                this.compile(ast.children[0], ce, false, preserveReturnValue); // left
                this.compile(ast.children[2], ce, false, preserveReturnValue); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "PredicateLoopExpression": {
                // while loops
                const loop_start = wc;

                const pred = ast.children[1];
                this.compile(pred, ce, false, preserveReturnValue);

                const jof_wc = wc++;
                instructions[jof_wc] = { tag: "JOF", addr: -1 };

                const body = ast.children[2];
                this.compile(body, ce, false, preserveReturnValue);

                instructions[wc++] = { tag: "POP" };
                instructions[wc++] = {
                    tag: "GOTO",
                    addr: loop_start,
                };
                instructions[jof_wc].addr = wc;
                break;
            }
            case "Crate": {
                const locals = scan(ast);
                instructions[wc++] = { tag: "ENTER_SCOPE", num: locals.length };
                const extended_ce = compile_time_environment_extend(locals, ce);
                this.compileChildren(ast, extended_ce, false, preserveReturnValue);
                // call main function
                if (mainAddr != -1) {
                    instructions[wc++] = {
                        tag: "LD",
                        sym: "main",
                        pos: compile_time_environment_position(
                            extended_ce,
                            "main"
                        ),
                    };
                    instructions[wc++] = { tag: "CALL", arity: 0 };
                }
                instructions[wc++] = { tag: "EXIT_SCOPE" };
                break;
            }
            case "BlockExpression": {
                const body = findNodeByTag(ast, "Statements");
                const locals = scan(body);
                instructions[wc++] = { tag: "ENTER_SCOPE", num: locals.length };
                const backup = backupEnv(ce);
                const extended_ce = compile_time_environment_extend(locals, ce);
                this.compileChildren(ast, extended_ce, false, preserveReturnValue);
                const frameIdx = extended_ce.length - 1;
                const localFrame = extended_ce[frameIdx];
                const dropInstructions = generateDropInstructions(localFrame, frameIdx, this.resultIdx, preserveReturnValue);
                dropInstructions.forEach(instr => {
                  instructions[wc++] = instr;
                });
                
                restoreEnv(extended_ce, backup);
                instructions[wc++] = { tag: "EXIT_SCOPE" };
                break;
            }
            case "Statements": {
                this.compileStatementsChildren(ast, ce, preserveReturnValue);
                break;
            }
            case "IfExpression": {
                const pred = ast.children[1];
                this.compile(pred, ce, false, preserveReturnValue);

                const jof_wc = wc++;
                instructions[jof_wc] = { tag: "JOF", addr: -1 };

                const cons = ast.children[2];
                this.compile(cons, ce, false, preserveReturnValue);

                const goto_wc = wc++;
                instructions[goto_wc] = { tag: "GOTO", addr: -1 };

                const altExists = ast.children.length > 4;
                if (altExists) {
                    const alternative_address = wc;
                    instructions[jof_wc].addr = alternative_address;
                    const alt = ast.children[4];
                    this.compile(alt, ce, false, preserveReturnValue);
                } else {
                    // If there's no else branch and the condition is false,
                    // the expression should evaluate to undefined.
                    instructions[jof_wc].addr = wc;
                    instructions[wc++] = { tag: "LDC", val: undefined };
                }
                instructions[goto_wc].addr = wc;
                break;
            }
            case "ArithmeticOrLogicalExpression": {
                this.compile(ast.children[0], ce, false, preserveReturnValue); // left
                this.compile(ast.children[2], ce, false, preserveReturnValue); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "NegationExpression": {
                this.compile(ast.children[1], ce, false, preserveReturnValue);
                const unop = extractTerminalValue(ast.children[0]);
                instructions[wc++] = { tag: "UNOP", sym: unop };
                break;
            }
            case "ExpressionStatement": {
                this.compile(ast.children[0], ce, false, preserveReturnValue);
                if (
                    ast.children[1] &&
                    extractTerminalValue(ast.children[1]) === ";"
                ) {
                    instructions[wc++] = { tag: "POP" };
                }
                break;
            }
            case "AssignmentExpression": {
                // Get the left-hand side of the assignment
                const leftNode = ast.children[0];

                if (leftNode.tag === "PathExpression_") {
                    // Direct variable assignment (x = value)
                    // Compile the right hand side expression first
                    this.compile(ast.children[2], ce, true, preserveReturnValue);

                    const varName = extractTerminalValue(leftNode);
                    const position = compile_time_environment_position(
                        ce,
                        varName
                    );

                    // Emit a DROP instruction for the current content of the variable,
                    // if it currently owns its value.
                    if (ce[position[0]][position[1]].ownsVal) {
                        instructions[wc++] = { tag: "DROP", pos: position };
                    }

                    // After dropping old value, mark var as new owner
                    ce[position[0]][position[1]].ownsVal = true;
                    
                    instructions[wc++] = {
                        tag: "ASSIGN",
                        pos: position,
                    };
                } else if (leftNode.tag === "DereferenceExpression") {
                    // Assignment through dereferenced reference (*x = value)

                    // First compile the reference expression (what *x points to)
                    this.compile(leftNode.children[1], ce, true, preserveReturnValue);

                    // Then compile the right-hand side expression (the value to assign)
                    this.compile(ast.children[2], ce, true, preserveReturnValue);

                    // Then update the value at the reference
                    // Now stack has [ref_address, value]
                    instructions[wc++] = { tag: "UPDATE_REF" };
                } else {
                    // Unsupported left-hand side type
                    throw new Error(
                        `Unsupported assignment target: ${leftNode.tag}`
                    );
                }
                break;
            }
            case "BorrowExpression": {
                // For creating a reference (&value or &mut value)
                // We need to pass the variable position, not just its value
                const symVal = extractTerminalValue(
                    ast.children[ast.children.length - 1]
                );
                const position = compile_time_environment_position(ce, symVal);

                // Check if this is a mutable reference
                let isMutable = false;
                for (const child of ast.children) {
                    if (extractTerminalValue(child) === "mut") {
                        isMutable = true;
                        break;
                    }
                }

                checkBorrow(ce, position, symVal, isMutable);

                // Push the environment position to be used when creating the reference
                instructions[wc++] = {
                    tag: "REF",
                    pos: position,
                    mutable: isMutable,
                };
                break;
            }
            case "DereferenceExpression": {
                // Get the reference expression
                const referenceExpr = ast.children[1];
                this.compile(referenceExpr, ce, false, preserveReturnValue);

                // Add DEREF instruction
                instructions[wc++] = { tag: "DEREF" };
                break;
            }
            default: {
                // for nodes not specifically handled, recursively compile their children.
                this.compileChildren(ast, ce, false, preserveReturnValue);
                break;
            }
        }
    }

    private typeCheck(ast: any): boolean {
        const valid = this.typeChecker.check(ast);
        return valid;
    }

    public compileProgram(ast: any): Instruction[] {
        const valid = this.typeCheck(ast);
        if (!valid) {
            throw new Error('Type checking failed: ' + this.typeChecker.getErrors());
        }

        wc = 0;
        instructions = [];
        this.compile(ast, global_compile_environment, false, false);
        instructions[wc++] = { tag: "DONE" };
        return instructions;
    }

    private compileChildren(ast: any, ce: any, isCheckOwnership: boolean, preserveReturnValue: boolean): void {
        if (ast.children && ast.children.length > 0) {
            ast.children.forEach((child: any) =>
                this.compile(child, ce, isCheckOwnership, preserveReturnValue)
            );
        }
    }
    
    private compileStatementsChildren(ast: any, ce: any, preserveReturnValue: boolean): void {
        if (ast.children && ast.children.length > 0) {
            ast.children.forEach((child: any) => {
                if (child.tag == "PathExpression_") {
                    const symVal = extractTerminalValue(child);
                    this.resultIdx.push(compile_time_environment_position(ce, symVal));
                    this.compile(child, ce, true, preserveReturnValue);
                } else {
                    this.compile(child, ce, false, preserveReturnValue);
                }
            });
        }
    }

    private hasMutKeyword(ast: any): boolean {
        // Find the PatternNoTopAlt node which contains IdentifierPattern
        const patternNode = findNodeByTag(ast, "PatternNoTopAlt");
        if (!patternNode) return false;

        // Find the IdentifierPattern node that might contain 'mut'
        const identifierPatternNode = findNodeByTag(
            patternNode,
            "IdentifierPattern"
        );
        if (!identifierPatternNode) return false;

        // Check if any of the children of IdentifierPattern is the 'mut' keyword
        return identifierPatternNode.children.some(
            (child: any) => child.tag === "Terminal" && child.val === "mut"
        );
    }
}

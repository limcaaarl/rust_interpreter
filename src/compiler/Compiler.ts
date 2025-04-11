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
} from "./CompilerHelper";
import { Instruction } from "./Instruction";
import { scan } from "../Utils";
import { LiteralExpressionContext } from "../parser/src/RustParser";

let instructions: Instruction[] = [];
let wc = 0;
let mainAddr = -1;

const global_compile_environment = []

export class Compiler {
    public astToJson(node: ParseTree): any {
        if (node instanceof TerminalNode) {
            if (node.parent instanceof LiteralExpressionContext) {
                return {
                    tag: "Terminal",
                    val: getLiteralVal(node.parent),
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

    private compile(ast: any, ce: any): void {
        // console.log(ast.tag);
        switch (ast.tag) {
            case "LetStatement": {
                const letNameNode = findNodeByTag(ast, "Identifier");
                const letName = extractTerminalValue(letNameNode);

                // Compile the right hand side of the '='
                this.compile(ast.children[3], ce);

                instructions[wc++] = {
                    tag: "ASSIGN",
                    pos: compile_time_environment_position(ce, letName),
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
                instructions[wc++] = {
                    tag: "LD",
                    sym: symVal,
                    pos: compile_time_environment_position(ce, symVal),
                };
                break;
            }
            case "CallExpression": {
                this.compileChildren(ast, ce);
                const callParamsNode = findNodeByTag(ast, "CallParams");
                instructions[wc++] = {
                    tag: "CALL",
                    arity: Math.floor(callParamsNode.children.length / 2) + 1,
                };
                break;
            }
            case "Function_": {
                const funcName = extractTerminalValue(
                    findNodeByTag(ast, "Identifier")
                );
                if (funcName == "main") mainAddr = wc;
                const funcParams = getFunctionParams(ast);
                const paramNames = funcParams.map(param => param.name);
                instructions[wc++] = {
                    tag: "LDF",
                    arity: funcParams.length,
                    retType: getReturnType(ast),
                    addr: wc + 1,
                };
                const goto_wc = wc++;
                instructions[goto_wc] = { tag: "GOTO", addr: -1 };
                const extended_ce = compile_time_environment_extend(paramNames, ce);
                this.compile(
                    findNodeByTag(ast, "BlockExpression"),
                    extended_ce
                );
                // TODO: Not sure if we want to return () implicitly as this would result in main evaluating to '()'
                // Rust returns `()` implicitly for functions that do not return any value
                // instructions[wc++] = { tag: "LDC", val: "()" };
                instructions[wc++] = { tag: "RESET" };
                instructions[goto_wc].addr = wc;
                instructions[wc++] = {
                    tag: "ASSIGN",
                    pos: compile_time_environment_position(extended_ce, funcName),
                };
                instructions[wc++] = { tag: "POP" };
                break;
            }
            case "ReturnExpression": {
                // Tail call not supported yet

                // compile the rest of the expression
                for (let i = 1; i < ast.children.length; i++) {
                    this.compile(ast.children[i], ce);
                }
                instructions[wc++] = { tag: "RESET" };
                break;
            }
            case "LazyBooleanExpression": {
                this.compile(ast.children[0], ce); // left
                this.compile(ast.children[2], ce); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "ComparisonExpression": {
                this.compile(ast.children[0], ce); // left
                this.compile(ast.children[2], ce); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "PredicateLoopExpression": {
                // while loops
                const loop_start = wc;

                const pred = ast.children[1];
                this.compile(pred, ce);

                const jof_wc = wc++;
                instructions[jof_wc] = { tag: "JOF", addr: -1 };

                const body = ast.children[2];
                this.compile(body, ce);

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
                this.compileChildren(
                    ast,
                    extended_ce
                );
                // call main function
                if (mainAddr != -1) {
                    instructions[wc++] = {
                        tag: "LD",
                        sym: "main",
                        pos: compile_time_environment_position(extended_ce, "main"),
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
                this.compileChildren(
                    ast,
                    compile_time_environment_extend(locals, ce)
                );
                instructions[wc++] = { tag: "EXIT_SCOPE" };
                break;
            }
            case "IfExpression": {
                const pred = ast.children[1];
                this.compile(pred, ce);

                const jof_wc = wc++;
                instructions[jof_wc] = { tag: "JOF", addr: -1 };

                const cons = ast.children[2];
                this.compile(cons, ce);

                const goto_wc = wc++;
                instructions[goto_wc] = { tag: "GOTO", addr: -1 };

                const altExists = ast.children.length > 4;
                if (altExists) {
                    const alternative_address = wc;
                    instructions[jof_wc].addr = alternative_address;
                    const cons = ast.children[4];
                    this.compile(cons, ce);
                }
                instructions[goto_wc].addr = wc;
                break;
            }
            case "ArithmeticOrLogicalExpression": {
                this.compile(ast.children[0], ce); // left
                this.compile(ast.children[2], ce); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "NegationExpression": {
                this.compile(ast.children[1], ce);
                const unop = extractTerminalValue(ast.children[0]);
                instructions[wc++] = { tag: "UNOP", sym: unop };
                break;
            }
            case "ExpressionStatement": {
                this.compile(ast.children[0], ce);
                if (
                    ast.children[1] &&
                    extractTerminalValue(ast.children[1]) === ";"
                ) {
                    instructions[wc++] = { tag: "POP" };
                }
                break;
            }
            default: {
                // for nodes not specifically handled, recursively compile their children.
                this.compileChildren(ast, ce);
                break;
            }
        }
    }

    public compileProgram(ast: any): Instruction[] {
        wc = 0;
        instructions = [];
        this.compile(ast, global_compile_environment);
        instructions[wc++] = { tag: "DONE" };
        return instructions;
    }

    private compileChildren(ast: any, ce: any): void {
        if (ast.children && ast.children.length > 0) {
            ast.children.forEach((child: any) => this.compile(child, ce));
        }
    }
}

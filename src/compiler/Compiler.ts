import { ParseTree, ParserRuleContext, TerminalNode } from "antlr4ng";
import {
    findNodeByTag,
    extractTerminalValue,
    getLiteralVal,
    getNodeType,
    getFunctionParams,
    getReturnType,
    getLiteralType,
} from "./CompilerHelper";
import { Instruction } from "./Instruction";
import { scan } from "../Utils";
import { LiteralExpressionContext } from "../parser/src/RustParser";
import { TypeChecker } from "../typechecker/TypeChecker";

let instructions: Instruction[] = [];
let wc = 0;
let mainAddr = -1;

export class Compiler {
    private typeChecker: TypeChecker = new TypeChecker();

    public astToJson(node: ParseTree): any {
        if (node instanceof TerminalNode) {
            if (node.parent instanceof LiteralExpressionContext) {
                return {
                    tag: "Terminal",
                    val: getLiteralVal(node.parent),
                    type: getLiteralType(node.parent)
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

    private compile(ast: any): void {
        // console.log(ast.tag);
        switch (ast.tag) {
            case "LetStatement": {
                const letNameNode = findNodeByTag(ast, "Identifier");
                const letName = extractTerminalValue(letNameNode);

                const typeNode = findNodeByTag(ast, 'Type_');

                // If type annotation exists
                if (typeNode) {
                    this.compile(ast.children[5]);
                } else { // If there is no type annotation
                    this.compile(ast.children[3]);
                }

                instructions[wc++] = {
                    tag: "ASSIGN",
                    sym: letName,
                };

                // TODO: This POP seems to be causing some issues for let statements inside functions.
                //       Popping the values breaks the evaluation. Will comment it for now

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
                instructions[wc++] = { tag: "LD", sym: symVal };
                break;
            }
            case "CallExpression": {
                this.compileChildren(ast);
                const callParamsNode = findNodeByTag(ast, "CallParams");
                instructions[wc++] = {
                    tag: "CALL",
                    arity: Math.floor(callParamsNode.children.length / 2) + 1,
                };
                break;
            }
            case "Function_": {
                const funcName = extractTerminalValue(findNodeByTag(ast, "Identifier"));
                if (funcName == "main") mainAddr = wc;

                instructions[wc++] = {
                    tag: "LDF",
                    prms: getFunctionParams(ast),
                    retType: getReturnType(ast),
                    addr: wc + 1,
                };
                const goto_wc = wc++;
                instructions[goto_wc] = { tag: "GOTO", addr: -1 };
                this.compile(findNodeByTag(ast, "BlockExpression"));
                // TODO: Not sure if we want to return () implicitly as this would result in main evaluating to '()'
                // Rust returns `()` implicitly for functions that do not return any value
                // instructions[wc++] = { tag: "LDC", val: "()" };
                instructions[wc++] = { tag: "RESET" };
                instructions[goto_wc].addr = wc;
                instructions[wc++] = { tag: "ASSIGN", sym: funcName };
                instructions[wc++] = { tag: "POP" };
                break;
            }
            case "ReturnExpression": {
                // Tail call not supported yet

                // compile the rest of the expression
                for (let i = 1; i < ast.children.length; i++) {
                    this.compile(ast.children[i]);
                }
                instructions[wc++] = { tag: "RESET" };
                break;
            }
            case "LazyBooleanExpression": {
                this.compile(ast.children[0]); // left
                this.compile(ast.children[2]); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "ComparisonExpression": {
                this.compile(ast.children[0]); // left
                this.compile(ast.children[2]); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "PredicateLoopExpression": {
                // while loops
                const loop_start = wc;

                const pred = ast.children[1];
                this.compile(pred);

                const jof_wc = wc++;
                instructions[jof_wc] = { tag: "JOF", addr: -1 };

                const body = ast.children[2];
                this.compile(body);

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
                instructions[wc++] = { tag: "ENTER_SCOPE", syms: locals };
                this.compileChildren(ast);
                // call main function
                if (mainAddr != -1) {
                    instructions[wc++] = { tag: "LD", sym: "main" };
                    instructions[wc++] = { tag: "CALL", arity: 0 };
                }
                instructions[wc++] = { tag: "EXIT_SCOPE" };
                break;
            }
            case "BlockExpression": {
                const body = findNodeByTag(ast, "Statements");
                const locals = scan(body);
                instructions[wc++] = { tag: "ENTER_SCOPE", syms: locals };
                this.compileChildren(ast);
                instructions[wc++] = { tag: "EXIT_SCOPE" };
                break;
            }
            case "IfExpression": {
                const pred = ast.children[1];
                this.compile(pred);

                const jof_wc = wc++;
                instructions[jof_wc] = { tag: "JOF", addr: -1 };

                const cons = ast.children[2];
                this.compile(cons);

                const goto_wc = wc++;
                instructions[goto_wc] = { tag: "GOTO", addr: -1 };

                const altExists = ast.children.length > 4;
                if (altExists) {
                    const alternative_address = wc;
                    instructions[jof_wc].addr = alternative_address;
                    const alt = ast.children[4];
                    this.compile(alt);
                } else {
                    instructions[jof_wc].addr = wc;
                }
                instructions[goto_wc].addr = wc;
                break;
            }
            case "ArithmeticOrLogicalExpression": {
                this.compile(ast.children[0]); // left
                this.compile(ast.children[2]); // right
                const binop = extractTerminalValue(ast.children[1]);
                instructions[wc++] = { tag: "BINOP", sym: binop };
                break;
            }
            case "NegationExpression": {
                this.compile(ast.children[1]);
                const unop = extractTerminalValue(ast.children[0]);
                instructions[wc++] = { tag: "UNOP", sym: unop };
                break;
            }
            case "ExpressionStatement": {
                this.compile(ast.children[0]);
                if (ast.children[1] && extractTerminalValue(ast.children[1]) === ";") {
                    instructions[wc++] = { tag: "POP" };
                }
                break;
            }
            default: {
                // for nodes not specifically handled, recursively compile their children.
                this.compileChildren(ast);
                break;
            }
        }
    }

    private typeCheck(ast: any): boolean {
        const valid = this.typeChecker.check(ast);
        // if (!valid) {
        //     const errors = this.typeChecker.getErrors();
        //     console.error('Type checking errors:');
        //     errors.forEach(err => console.error(`- ${err}`));
        // }
        return valid;
    }

    public compileProgram(ast: any): Instruction[] {
        const valid = this.typeCheck(ast);
        if (!valid) {
            throw new Error('Type checking failed: ' + this.typeChecker.getErrors());
        }

        wc = 0;
        instructions = [];
        this.compile(ast);
        instructions[wc++] = { tag: "DONE" };
        return instructions;
    }

    private compileChildren(ast: any): void {
        if (ast.children && ast.children.length > 0) {
            ast.children.forEach((child: any) => this.compile(child));
        }
    }
}

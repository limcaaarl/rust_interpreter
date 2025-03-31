import { ParseTree, ParserRuleContext, TerminalNode } from "antlr4ng";
import {
    findNodeByTag,
    extractTerminalValue,
    getLiteralVal,
    getNodeType,
} from "./CompilerHelper";
import { Instruction } from "./Instruction";
import { scan } from "../Utils";
import { LiteralExpressionContext } from "../parser/src/RustParser";

let instructions: Instruction[] = [];
let wc = 0;

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


    private compile(ast: any): void {
        // console.log("Tag: " + ast.tag);
        switch (ast.tag) {
            // TODO: function implementation
            // case "Function_":
            //     // find child that contains the function name
            //     break;
            case "LetStatement": {
                // TODO: recheck LetStatement after done with function
                const letNameNode = findNodeByTag(ast, "Identifier");
                const letName = extractTerminalValue(letNameNode);

                const letLiteralNode = findNodeByTag(ast, "LiteralExpression_");
                this.compile(letLiteralNode);

                instructions[wc++] = {
                    tag: "ASSIGN",
                    sym: letName,
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
                instructions[wc++] = { tag: "LD", sym: symVal };
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
            case "BlockExpression": {
                const body = findNodeByTag(ast, "Statements");
                const locals = scan(body);
                instructions[wc++] = { tag: "ENTER_SCOPE", syms: locals };
                this.compileChildren(ast);
                instructions[wc++] = { tag: "EXIT_SCOPE" };
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

    public compileProgram(ast: any): Instruction[] {
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

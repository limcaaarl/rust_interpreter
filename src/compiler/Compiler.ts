import { ParseTree, ParserRuleContext, TerminalNode } from "antlr4ng";
import {
    findNodeByTag,
    extractTerminalValue,
    extractType,
} from "./CompilerHelper";
import { Instruction } from "./Instruction";

let instructions: Instruction[] = [];
let wc = 0;

export class Compiler {
    public astToJson(node: ParseTree): any {
        if (node instanceof TerminalNode) {
            return {
                tag: "Terminal",
                val: node.getText(),
                // sym: node.symbol.type,
            };
        } else if (node instanceof ParserRuleContext) {
            const result: any = {
                tag: this.getNodeType(node),
                children: [],
            };
            for (let i = 0; i < node.getChildCount(); i++) {
                result.children.push(this.astToJson(node.getChild(i)));
            }
            return result;
        }
        return null;
    }

    private getNodeType(node: ParserRuleContext): string {
        return node.constructor.name.replace("Context", "");
    }

    private compile(ast: any): void {
        console.log("Tag: " + ast.tag);
        switch (ast.tag) {
            // TODO: function implementation
            // case "Function_":
            //     // find child that contains the function name
            //     break;
            case "LetStatement": // TODO: recheck LetStatement after done with function
                const letNameNode = findNodeByTag(ast, "Identifier");
                const letName = extractTerminalValue(letNameNode);

                const letLiteralNode = findNodeByTag(ast, "LiteralExpression_");
                this.compile(letLiteralNode);

                instructions[wc++] = {
                    tag: "ASSIGN",
                    sym: letName,
                };
                break;
            case "LiteralExpression":
                if (ast.children && ast.children.length > 0) {
                    const term = ast.children[0];
                    instructions[wc++] = {
                        tag: "LDC",
                        val: term.val,
                    };
                }
                break;
            default:
                // for nodes not specifically handled, recursively compile their children.
                if (ast.children && ast.children.length > 0) {
                    ast.children.forEach((child: any) => this.compile(child));
                }
                break;
        }
    }

    public compileProgram(ast: any): Instruction[] {
        wc = 0;
        instructions = [];
        this.compile(ast);
        instructions[wc++] = { tag: "DONE" };
        return instructions;
    }
}

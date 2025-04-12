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

    private compile(ast: any, ce: any): void {
        // console.log(ast.tag);
        switch (ast.tag) {
            case "LetStatement": {
                const letNameNode = findNodeByTag(ast, "Identifier");
                const letName = extractTerminalValue(letNameNode);

                // Compile the right hand side of the '='
                this.compile(ast.children[3], ce);
                const typeNode = findNodeByTag(ast, 'Type_');

                // If type annotation exists
                if (typeNode) {
                    this.compile(ast.children[5], ce);
                } else { // If there is no type annotation
                    this.compile(ast.children[3], ce);
                }

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
                    const alt = ast.children[4];
                    this.compile(alt, ce);
                } else {
                    instructions[jof_wc].addr = wc;
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
            case "AssignmentExpression": {
                // Get the left-hand side of the assignment
                const leftNode = ast.children[0];

                if (leftNode.tag === 'PathExpression_') {
                    // Direct variable assignment (x = value)
                    // Compile the right hand side expression first
                    this.compile(ast.children[2], ce);

                    const varName = extractTerminalValue(leftNode);

                    instructions[wc++] = {
                        tag: "ASSIGN",
                        pos: compile_time_environment_position(ce, varName),
                    };
                } else if (leftNode.tag === 'DereferenceExpression') {
                    // Assignment through dereferenced reference (*x = value)

                    // First compile the reference expression (what *x points to)
                    this.compile(leftNode.children[1], ce);

                    // Then compile the right-hand side expression (the value to assign)
                    this.compile(ast.children[2], ce);

                    // Then update the value at the reference
                    // Now stack has [ref_address, value]
                    instructions[wc++] = { tag: "UPDATE_REF" };
                } else {
                    // Unsupported left-hand side type
                    throw new Error(`Unsupported assignment target: ${leftNode.tag}`);
                }
                break;
            }
            case "BorrowExpression": {
                // For creating a reference (&value or &mut value)
                // We need to pass the variable position, not just its value
                const symVal = extractTerminalValue(ast.children[ast.children.length - 1]);
                const position = compile_time_environment_position(ce, symVal);

                // Check if this is a mutable reference
                let isMutable = false;
                for (const child of ast.children) {
                    if (extractTerminalValue(child) === "mut") {
                        isMutable = true;
                        break;
                    }
                }

                // Push the environment position to be used when creating the reference
                instructions[wc++] = {
                    tag: "REF",
                    pos: position,
                    mutable: isMutable
                };
                break;
            }
            case "DereferenceExpression": {
                // Get the reference expression
                const referenceExpr = ast.children[1];
                this.compile(referenceExpr, ce);

                // Add DEREF instruction
                instructions[wc++] = { tag: "DEREF" };
                break;
            }
            default: {
                // for nodes not specifically handled, recursively compile their children.
                this.compileChildren(ast, ce);
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
        this.compile(ast, global_compile_environment);
        instructions[wc++] = { tag: "DONE" };
        return instructions;
    }

    private compileChildren(ast: any, ce: any): void {
        if (ast.children && ast.children.length > 0) {
            ast.children.forEach((child: any) => this.compile(child, ce));
        }
    }

    private hasMutKeyword(ast: any): boolean {
        // Find the PatternNoTopAlt node which contains IdentifierPattern
        const patternNode = findNodeByTag(ast, "PatternNoTopAlt");
        if (!patternNode) return false;

        // Find the IdentifierPattern node that might contain 'mut'
        const identifierPatternNode = findNodeByTag(patternNode, "IdentifierPattern");
        if (!identifierPatternNode) return false;

        // Check if any of the children of IdentifierPattern is the 'mut' keyword
        return identifierPatternNode.children.some(
            (child: any) => child.tag === "Terminal" && child.val === "mut"
        );
    }
}

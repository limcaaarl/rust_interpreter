import { BasicEvaluator } from "conductor/src/conductor/runner";
import { IRunnerPlugin } from "conductor/src/conductor/runner/types";
import { CharStream, CommonTokenStream, AbstractParseTreeVisitor } from 'antlr4ng';
import { ArithmeticOrLogicalExpressionContext, BlockExpressionContext, ComparisonExpressionContext, CrateContext, ExpressionStatementContext, ExpressionWithBlockContext, Function_Context, GroupedExpressionContext, IfExpressionContext, LetStatementContext, LiteralExpressionContext, PathExpressionContext, RustParser, StatementContext, StatementsContext } from './parser/src/RustParser';
import { RustParserVisitor } from "./parser/src/RustParserVisitor";
import { RustLexer } from "./parser/src/RustLexer";
import { Compiler } from "./compiler/Compiler";

class RustEvaluatorVisitor extends AbstractParseTreeVisitor<any> implements RustParserVisitor<any> {
    private environmentStack: Map<string, any>[] = [new Map()];

    // Get the current environment
    private getCurrentEnvironment(): Map<string, any> {
        return this.environmentStack[this.environmentStack.length - 1];
    }

    // Enter a new environment
    private enterEnvironment(): void {
        this.environmentStack.push(new Map());
    }

    // Exit the current environment
    private exitEnvironment(): void {
        this.environmentStack.pop();
    }

    visitCrate(ctx: CrateContext): any {
        // Find and execute the main function
        for (const item of ctx.item()) {
            if (item.visItem()?.function_()?.identifier().NON_KEYWORD_IDENTIFIER().getText() === 'main') {
                return this.visitFunction_(item.visItem().function_());
            }
        }
        throw new Error("No main function found");
    }

    visitFunction_(ctx: Function_Context): any {
        // Enter a new environment for this function
        this.enterEnvironment();

        try {
            // Execute the function body
            const result = this.visitBlockExpression(ctx.blockExpression());
            return result;
        } finally {
            // Always exit the environment, even if there's an error
            this.exitEnvironment();
        }
    }

    visitBlockExpression(ctx: BlockExpressionContext): any {
        if (ctx.statements() === null) {
            // Empty block, just return null
            return null;
        }
        // Enter a new environment for this block
        this.enterEnvironment();

        try {
            // Execute statements in the block
            return this.visitStatements(ctx.statements());
        } finally {
            // Always exit the environment, even if there's an error
            this.exitEnvironment();
        }
    }

    visitStatements(ctx: StatementsContext): any {
        let lastResult: any = null;
        if (ctx.statement()) {
            for (const stmt of ctx.statement()) {
                lastResult = this.visitStatement(stmt);
            }
        }
        if (ctx.expression()) {
            lastResult = this.visitExpression(ctx.expression());
        }
        return lastResult;
    }

    visitStatement(ctx: StatementContext): any {
        if (ctx.letStatement()) {
            this.visitLetStatement(ctx.letStatement());
        }
        if (ctx.expressionStatement()) {
            return this.visitExpressionStatement(ctx.expressionStatement());
        }
        return null;
    }

    visitExpressionStatement(ctx: ExpressionStatementContext): any {
        if (ctx.expression()) {
            // Visit the expression but ignore the result
            this.visitExpression(ctx.expression());
        } else if (ctx.expressionWithBlock()) {
            return this.visitExpressionWithBlock(ctx.expressionWithBlock());
        }
        return null;
    }

    visitArithmeticOrLogicalExpression(ctx: ArithmeticOrLogicalExpressionContext): any {
        const left = this.visitExpression(ctx.expression(0));
        const right = this.visitExpression(ctx.expression(1));
        if (ctx.STAR()) {
            return left * right;
        } else if (ctx.SLASH()) {
            return left / right;
        } else if (ctx.PLUS()) {
            return left + right;
        } else if (ctx.MINUS()) {
            return left - right;
        }
        throw new Error(`Unsupported arithmetic operator: ${ctx.getText()}`);
    }

    visitExpressionWithBlock(ctx: ExpressionWithBlockContext): any {
        if (ctx.blockExpression()) {
            return this.visitBlockExpression(ctx.blockExpression());
        } else if (ctx.ifExpression()) {
            return this.visitIfExpression(ctx.ifExpression());
        }
        return null;
    }

    visitLetStatement(ctx: LetStatementContext): any {
        const varName = ctx.patternNoTopAlt().patternWithoutRange().identifierPattern().identifier().NON_KEYWORD_IDENTIFIER().getText();
        const value = this.visitExpression(ctx.expression());
        this.getCurrentEnvironment().set(varName, value);
        return null;
    }

    visitExpression(ctx: any): any {
        if (ctx.literalExpression) {
            return this.visitLiteralExpression(ctx.literalExpression());
        } else if (ctx.pathExpression) {
            return this.visitPathExpression(ctx.pathExpression());
        } else if (ctx instanceof ArithmeticOrLogicalExpressionContext) {
            return this.visitArithmeticOrLogicalExpression(ctx);
        } else if (ctx instanceof GroupedExpressionContext) {
            return this.visitExpression(ctx.expression());
        } else if (ctx instanceof ComparisonExpressionContext) {
            return this.visitComparisonExpression(ctx);
        } else if (ctx.expressionWithBlock) {
            return this.visitExpressionWithBlock(ctx.expressionWithBlock());
        }
        // Add handling for other expression types as needed
        return null;
    }

    visitComparisonExpression(ctx: ComparisonExpressionContext): any {
        const left = this.visitExpression(ctx.expression(0));
        const right = this.visitExpression(ctx.expression(1));
        const operator = ctx.comparisonOperator();
        if (operator.EQEQ()) {
            return left === right;
        } else if (operator.NE()) {
            return left !== right;
        } else if (operator.GT()) {
            return left > right;
        } else if (operator.LT()) {
            return left < right;
        } else if (operator.GE()) {
            return left >= right;
        } else if (operator.LE()) {
            return left <= right;
        }
        throw new Error(`Unsupported comparison operator: ${ctx.getText()}`);
    }

    visitPathExpression(ctx: PathExpressionContext): any {
        const varName = ctx.pathInExpression().pathExprSegment()[0].pathIdentSegment().identifier().NON_KEYWORD_IDENTIFIER().getText();

        // Search through the environment stack from innermost to outermost
        for (let i = this.environmentStack.length - 1; i >= 0; i--) {
            const environment = this.environmentStack[i];
            if (environment.has(varName)) {
                return environment.get(varName);
            }
        }
        throw new Error(`Variable '${varName}' not found`);
    }

    visitIfExpression(ctx: IfExpressionContext): any {
        // Evaluate the condition
        const condition = this.visitExpression(ctx.expression());

        // If the condition is true, evaluate the then block
        if (condition) {
            return this.visitBlockExpression(ctx.blockExpression()[0]);
        }

        // If there's an else clause, evaluate it
        if (ctx.KW_ELSE()) {
            if (ctx.blockExpression()[1]) {
                return this.visitBlockExpression(ctx.blockExpression()[1]);
            } else if (ctx.ifExpression()) {
                return this.visitIfExpression(ctx.ifExpression());
            }
        }

        // If no else clause, return null
        return null;
    }

    visitLiteralExpression(ctx: LiteralExpressionContext): any {
        if (ctx.INTEGER_LITERAL()) {
            return parseInt(ctx.INTEGER_LITERAL().getText(), 10);
        } else if (ctx.KW_TRUE()) {
            return true;
        } else if (ctx.KW_FALSE()) {
            return false;
        } else if (ctx.FLOAT_LITERAL()) {
            return parseFloat(ctx.FLOAT_LITERAL().getText());
        } else if (ctx.STRING_LITERAL()) {
            return JSON.parse(ctx.getText());
        }
        // Handle other literal types
        return null;
    }

    // Override the default result method from AbstractParseTreeVisitor
    protected defaultResult(): number {
        return 0;
    }

    // Override the aggregate result method
    protected aggregateResult(aggregate: number, nextResult: number): number {
        return nextResult;
    }
}

export class RustEvaluator extends BasicEvaluator {
    private executionCount: number;
    private visitor: RustEvaluatorVisitor;
    private compiler: Compiler;

    constructor(conductor: IRunnerPlugin) {
        super(conductor);
        this.executionCount = 0;
        this.visitor = new RustEvaluatorVisitor();
        this.compiler = new Compiler();
    }

    async evaluateChunk(chunk: string): Promise<void> {
        this.executionCount++;
        try {
            // Create the lexer and parser
            const inputStream = CharStream.fromString(chunk);
            const lexer = new RustLexer(inputStream);
            const tokenStream = new CommonTokenStream(lexer);
            const parser = new RustParser(tokenStream);

            // Parse the input
            const tree = parser.crate();

            // TODO: Implement VM stuff here
            const astJson = this.compiler.astToJson(tree);
            const instructions = this.compiler.compileProgram(astJson);

            // Evaluate the parsed tree
            const result = this.visitor.visit(tree);

            // Send the result to the REPL
            this.conductor.sendOutput(`Result: ${result}`);

            return result;
        } catch (error) {
            // Handle errors and send them to the REPL
            if (error instanceof Error) {
                this.conductor.sendOutput(`Error: ${error.message}`);
            } else {
                this.conductor.sendOutput(`Error: ${String(error)}`);
            }
            throw error
        }
    }
}
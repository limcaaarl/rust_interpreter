import { BasicEvaluator } from "conductor/src/conductor/runner";
import { IRunnerPlugin } from "conductor/src/conductor/runner/types";
import { CharStream, CommonTokenStream, AbstractParseTreeVisitor } from 'antlr4ng';
import { BlockExpressionContext, CrateContext, ExpressionStatementContext, ExpressionWithBlockContext, Function_Context, InnerAttributeContext, ItemContext, LetStatementContext, LiteralExpressionContext, PathExpression_Context, PathExpressionContext, PathExprSegmentContext, RustParser, StatementContext, StatementsContext } from './parser/src/RustParser';
import { RustParserVisitor } from "./parser/src/RustParserVisitor";
import { RustLexer } from "./parser/src/RustLexer";

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

    // Visit the root crate node
    visitCrate(ctx: CrateContext): any {
        // Find and execute the main function
        for (const item of ctx.item()) {
            if (item.visItem()?.function_()?.identifier().NON_KEYWORD_IDENTIFIER().getText() === 'main') {
                return this.visitFunction_(item.visItem().function_());
            }
        }
        throw new Error("No main function found");
    }

    // Visit a function node
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

    // Visit a block expression
    visitBlockExpression(ctx: BlockExpressionContext): any {
        if (ctx.statements() === null) {
            // Empty block, just return null
            return null;
        }
        // Enter a new environment for this block
        this.enterEnvironment();

        try {
            // Execute statements in the block
            const result = this.visitStatements(ctx.statements());
            return result;
        } finally {
            // Always exit the environment, even if there's an error
            this.exitEnvironment();
        }
    }

    // Visit statements
    visitStatements(ctx: StatementsContext): any {
        let result = null;
        for (const stmt of ctx.statement()) {
            result = this.visitStatement(stmt);
        }
        return result;
    }

    // Visit a statement
    visitStatement(ctx: StatementContext): any {
        if (ctx.letStatement()) {
            return this.visitLetStatement(ctx.letStatement());
        }
        if (ctx.expressionStatement()) {
            return this.visitExpressionStatement(ctx.expressionStatement());
        }
        return null;
    }

    visitExpressionStatement(ctx: ExpressionStatementContext): any {
        if (ctx.expression()) {
            return this.visitExpression(ctx.expression());
        } else if (ctx.expressionWithBlock()) {
            return this.visitExpressionWithBlock(ctx.expressionWithBlock());
        }
        return null;
    }

    visitExpressionWithBlock(ctx: ExpressionWithBlockContext): any {
        if (ctx.blockExpression()) {
            return this.visitBlockExpression(ctx.blockExpression());
        }
        return null;
    }

    // Visit a let statement
    visitLetStatement(ctx: LetStatementContext): any {
        const varName = ctx.patternNoTopAlt().patternWithoutRange().identifierPattern().identifier().NON_KEYWORD_IDENTIFIER().getText();
        const value = this.visitExpression(ctx.expression());
        this.getCurrentEnvironment().set(varName, value);
        return value;
    }

    // Visit an expression
    visitExpression(ctx: any): any {
        if (ctx.literalExpression) {
            return this.visitLiteralExpression(ctx.literalExpression());
        } else if (ctx.pathExpression) {
            return this.visitPathExpression(ctx.pathExpression());
        }
        // Add handling for other expression types as needed
        return null;
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

    // Visit a literal expression
    visitLiteralExpression(ctx: LiteralExpressionContext): any {
        if (ctx.INTEGER_LITERAL()) {
            return parseInt(ctx.INTEGER_LITERAL().getText(), 10);
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

    constructor(conductor: IRunnerPlugin) {
        super(conductor);
        this.executionCount = 0;
        this.visitor = new RustEvaluatorVisitor();
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
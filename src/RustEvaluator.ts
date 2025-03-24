import { BasicEvaluator } from "conductor/src/conductor/runner";
import { IRunnerPlugin } from "conductor/src/conductor/runner/types";
import { CharStream, CommonTokenStream, AbstractParseTreeVisitor } from 'antlr4ng';
import { BlockExpressionContext, CrateContext, ExpressionStatementContext, Function_Context, InnerAttributeContext, ItemContext, LetStatementContext, LiteralExpressionContext, RustParser, StatementContext, StatementsContext } from './parser/src/RustParser';
import { RustParserVisitor } from "./parser/src/RustParserVisitor";
import { RustLexer } from "./parser/src/RustLexer";

class RustEvaluatorVisitor extends AbstractParseTreeVisitor<any> implements RustParserVisitor<any> {
    // Visit the root crate node
    visitCrate(ctx: CrateContext): any {
        console.log('visitCrate context: ', ctx);
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
        console.log('visitFunction_ context: ', ctx);
        // Execute the function body
        return this.visitBlockExpression(ctx.blockExpression());
    }

    // Visit a block expression
    visitBlockExpression(ctx: BlockExpressionContext): any {
        console.log('visitBlockExpression context: ', ctx);
        // Execute statements in the block
        return this.visitStatements(ctx.statements());
    }

    // Visit statements
    visitStatements(ctx: StatementsContext): any {
        console.log('visitStatements context: ', ctx);
        let result = null;
        for (const stmt of ctx.statement()) {
            result = this.visitStatement(stmt);
        }
        return result;
    }

    // Visit a statement
    visitStatement(ctx: StatementContext): any {
        console.log('visitStatement context: ', ctx);
        if (ctx.letStatement()) {
            return this.visitLetStatement(ctx.letStatement());
        }
        if (ctx.expressionStatement()) {
            return this.visitExpressionStatement(ctx.expressionStatement());
        }
        return null;
    }

    visitExpressionStatement(ctx: ExpressionStatementContext): any {
        console.log('visitExpressionStatement context: ', ctx);
        return this.visitExpression(ctx.expression());
    }

    // Visit a let statement
    visitLetStatement(ctx: LetStatementContext): any {
        console.log('visitLetStatement context: ', ctx);
        const varName = ctx.patternNoTopAlt().patternWithoutRange().identifierPattern().identifier().NON_KEYWORD_IDENTIFIER().getText();
        const value = this.visitExpression(ctx.expression());
        console.log(`let ${varName} = ${value}`);
        return value;
    }

    // Visit an expression
    visitExpression(ctx: any): any {
        console.log('visitExpression context: ', ctx);
        if (ctx.literalExpression()) {
            return this.visitLiteralExpression(ctx.literalExpression());
        }
        // Add handling for other expression types as needed
        return null;
    }

    // Visit a literal expression
    visitLiteralExpression(ctx: LiteralExpressionContext): any {
        console.log('visitLiteralExpression context: ', ctx);
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
            this.conductor.sendOutput(`Result of expression: ${result}`);
            
            // Resolve promise
            return Promise.resolve();
        } catch (error) {
            // Handle errors and send them to the REPL
            if (error instanceof Error) {
                this.conductor.sendOutput(`Error: ${error.message}`);
            } else {
                this.conductor.sendOutput(`Error: ${String(error)}`);
            }
            
            // Reject promise
            return Promise.reject(error);
        }
    }
}
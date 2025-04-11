import { extractTerminalValue, findNodeByTag, getFunctionParams, getReturnType, parseTypeString } from "../compiler/CompilerHelper";
import { getMainFunction } from "../Utils";
import { TypeEnvironment } from "./TypeEnvironment";
import { BOOL_TYPE, CHAR_TYPE, F32_TYPE, I32_TYPE, RustType, STR_TYPE, UNIT_TYPE } from "./Types";

export class TypeChecker {
    private env: TypeEnvironment = new TypeEnvironment();
    private errors: string[] = [];

    check(ast: any): boolean {
        this.errors = [];
        this.checkNode(ast);
        return this.errors.length === 0;
    }

    getErrors(): string[] {
        return this.errors;
    }

    public checkNode(node: any): RustType {
        if (!node) return UNIT_TYPE;

        switch (node.tag) {
            case 'Crate':
                return this.checkCrate(node);
            case 'Function_':
                return this.checkFunction(node);
            case 'LetStatement':
                return this.checkLetStatement(node);
            case 'LiteralExpression':
                return this.checkLiteral(node);
            case 'PathExpression_':
                return this.checkPathExpression(node);
            case 'BlockExpression':
                return this.checkBlock(node);
            case 'ReturnExpression':
                return this.checkReturnExpression(node);
            case 'ArithmeticOrLogicalExpression':
                return this.checkArithmeticOrLogicalExpression(node);
            case 'ComparisonExpression':
                return this.checkComparisonExpression(node);
            case 'LazyBooleanExpression':
                return this.checkLazyBooleanExpression(node);
            case 'IfExpression':
                return this.checkIfExpression(node);
            case 'PredicateLoopExpression':
                return this.checkPredicateLoopExpression(node);
            case 'CallExpression':
                return this.checkCallExpression(node);
            case 'NegationExpression':
                return this.checkNegationExpression(node);
            case 'ExpressionStatement':
                return this.checkExpressionStatement(node);
            case 'GroupedExpression':
                return this.checkGroupedExpression(node);
            default:
                return this.checkChildren(node);
        }
    }

    // Check all child nodes and return the type of the last child
    private checkChildren(node: any): RustType {
        if (!node.children || node.children.length === 0) {
            return UNIT_TYPE;
        }

        let lastType = UNIT_TYPE;
        for (const child of node.children) {
            lastType = this.checkNode(child);
        }
        return lastType;
    }

    // Crate is the root node, corresponds to a full program
    // Its type is the type of the main function
    private checkCrate(node: any): RustType {
        const functionNodes = this.scanFunctions(node);

        // 2-phase approach necessary cus with mutual recursion, each function needs to 
        // know about the other before either body is fully type-checked.
        // Phase 1: Register all function signatures first
        for (const func of functionNodes) {
            this.registerFunctionSignature(func);
        }

        // Phase 2: Check all function bodies
        for (const func of functionNodes) {
            const funcName = extractTerminalValue(findNodeByTag(func, 'Identifier'));
            if (funcName !== 'main') {  // Skip main, we'll handle it separately
                this.checkNode(func);
            }
        }

        // Special handling for main function
        const mainFunction = getMainFunction(node);
        if (!mainFunction) {
            this.errors.push('No main function found');
            return UNIT_TYPE;
        }

        // Check main function - its type is the type of its body
        return this.checkNode(mainFunction);
    }

    // Check function declaration
    private checkFunction(node: any): RustType {
        const funcName = extractTerminalValue(findNodeByTag(node, 'Identifier'));
        const funcType = this.env.lookup(funcName);

        if (!funcType || funcType.kind !== 'function') {
            this.errors.push(`Function ${funcName} not properly registered`);
            return UNIT_TYPE;
        }

        // Special handling for main function
        if (funcName === 'main') {
            const bodyNode = findNodeByTag(node, 'BlockExpression');
            return this.checkNode(bodyNode);
        }

        // Regular function handling (previously in checkFunctionBody)
        const params = getFunctionParams(node);

        // Check function body with parameter types in scope
        this.env.enterScope();
        params.forEach(p => {
            this.env.define(p.name, p.type);
        });

        const bodyNode = findNodeByTag(node, 'BlockExpression');
        const bodyType = this.checkNode(bodyNode);

        // Verify return type matches
        if (!this.typesMatch(bodyType, funcType.returnType)) {
            this.errors.push(`Function ${funcName} returns ${this.typeToString(bodyType)}, but its declared return type is ${this.typeToString(funcType.returnType)}`);
        }

        this.env.exitScope();
        return funcType;
    }

    // Check let statement
    private checkLetStatement(node: any): RustType {
        const nameNode = findNodeByTag(node, 'Identifier');
        const name = extractTerminalValue(nameNode);

        // Find type annotation if exists
        let declaredType: RustType | null = null;
        let inferredType: RustType;
        const typeNode = findNodeByTag(node, 'Type_');

        // If type annotation exists, check type compatibility
        if (typeNode) {
            const typeStr = extractTerminalValue(typeNode);
            declaredType = parseTypeString(typeStr);

            // Check expression type (right of '=')
            inferredType = this.checkNode(node.children[5]);

            // Verify type if explicitly declared
            if (declaredType && !this.typesMatch(inferredType, declaredType)) {
                this.errors.push(`Cannot assign value of type ${this.typeToString(inferredType)} to variable ${name} of type ${this.typeToString(declaredType)}`);
            }
        } else { // If there is no type annotation
            inferredType = this.checkNode(node.children[3]);
        }

        // Use either declared type or inferred type
        const finalType = declaredType || inferredType;
        this.env.define(name, finalType);

        return UNIT_TYPE;
    }

    // Check literals
    private checkLiteral(node: any): RustType {
        if (!node.children || node.children.length === 0) {
            return UNIT_TYPE;
        }

        const term = node.children[0];

        switch (term.type) {
            case 'i32':
                return I32_TYPE;
            case 'f32':
                return F32_TYPE;
            case 'bool':
                return BOOL_TYPE;
            case 'str':
                return STR_TYPE;
            case 'char':
                return CHAR_TYPE;
            default:
                return UNIT_TYPE;
        }
    }

    // Check variable references
    private checkPathExpression(node: any): RustType {
        const symVal = extractTerminalValue(node);
        const varType = this.env.lookup(symVal);

        if (!varType) {
            this.errors.push(`Unassigned name: ${symVal}`);
            return UNIT_TYPE;
        }

        return varType;
    }

    // Check block expressions
    private checkBlock(node: any): RustType {
        this.env.enterScope();

        try {
            const statementsNode = findNodeByTag(node, 'Statements');
            if (statementsNode) {
                return this.checkChildren(statementsNode);
            } else {
                return UNIT_TYPE;
            }
        } finally {
            this.env.exitScope();
        }
    }

    // Check return expressions
    private checkReturnExpression(node: any): RustType {
        if (node.children.length <= 1) {
            return UNIT_TYPE;
        }

        // Check the return value expression
        return this.checkNode(node.children[1]);
    }

    // Check arithmetic and logical expressions
    private checkArithmeticOrLogicalExpression(node: any): RustType {
        const leftType = this.checkNode(node.children[0]);
        const rightType = this.checkNode(node.children[2]);
        const operator = extractTerminalValue(node.children[1]);

        return this.checkBinaryOperation(leftType, rightType, operator);
    }

    // Check comparison expressions
    private checkComparisonExpression(node: any): RustType {
        const leftType = this.checkNode(node.children[0]);
        const rightType = this.checkNode(node.children[2]);
        const operator = extractTerminalValue(node.children[1]);

        // All comparison operators return boolean
        if (!this.typesMatchForComparison(leftType, rightType)) {
            this.errors.push(`Cannot compare ${this.typeToString(leftType)} with ${this.typeToString(rightType)}`);
        }

        return BOOL_TYPE;
    }

    // Check lazy boolean expressions (&&, ||)
    private checkLazyBooleanExpression(node: any): RustType {
        const leftType = this.checkNode(node.children[0]);
        const rightType = this.checkNode(node.children[2]);
        const operator = extractTerminalValue(node.children[1]);

        if (!this.typesMatch(leftType, BOOL_TYPE)) {
            this.errors.push(`Left operand of ${operator} must be boolean, got ${this.typeToString(leftType)}`);
        }

        if (!this.typesMatch(rightType, BOOL_TYPE)) {
            this.errors.push(`Right operand of ${operator} must be boolean, got ${this.typeToString(rightType)}`);
        }

        return BOOL_TYPE;
    }

    // Check if expressions
    private checkIfExpression(node: any): RustType {
        const conditionType = this.checkNode(node.children[1]);

        if (!this.typesMatch(conditionType, BOOL_TYPE)) {
            this.errors.push(`If condition must be boolean, got ${this.typeToString(conditionType)}`);
        }

        const thenType = this.checkNode(node.children[2]);

        // Check else block if it exists
        if (node.children.length > 4) {
            const elseType = this.checkNode(node.children[4]);

            // If there's an else branch, the result type is the common type of both branches
            if (!this.typesMatch(thenType, elseType)) {
                this.errors.push(`Mismatched types in if/else expression: ${this.typeToString(thenType)} vs ${this.typeToString(elseType)}`);
                // Return the 'then' type as a fallback
                return thenType;
            }
        }

        return thenType;
    }

    // Check while loops
    private checkPredicateLoopExpression(node: any): RustType {
        const conditionType = this.checkNode(node.children[1]);

        if (!this.typesMatch(conditionType, BOOL_TYPE)) {
            this.errors.push(`Loop condition must be boolean, got ${this.typeToString(conditionType)}`);
        }

        this.checkNode(node.children[2]); // Check the body
        return UNIT_TYPE; // Loops always return the unit type
    }

    // Check function calls
    private checkCallExpression(node: any): RustType {
        // First child should be the function identifier
        const funcNode = node.children[0];
        const funcType = this.checkNode(funcNode);

        if (funcType.kind !== 'function') {
            this.errors.push(`Cannot call non-function type: ${this.typeToString(funcType)}`);
            return UNIT_TYPE;
        }

        // Check parameters
        const callParamsNode = findNodeByTag(node, 'CallParams');
        const args = [];

        // Extract argument types from call params
        if (callParamsNode && callParamsNode.children) {
            for (let i = 0; i < callParamsNode.children.length; i++) {
                const child = callParamsNode.children[i];
                if (child.tag !== 'Terminal') { // Skip commas
                    args.push(this.checkNode(child));
                }
            }
        }

        // Check number of arguments matches function signature
        if (args.length !== funcType.params.length) {
            this.errors.push(`Function expected ${funcType.params.length} arguments but got ${args.length}`);
            return funcType.returnType;
        }

        // Check each argument type
        for (let i = 0; i < args.length; i++) {
            if (!this.typesMatch(args[i], funcType.params[i])) {
                this.errors.push(`Function argument ${i + 1} expected ${this.typeToString(funcType.params[i])} but got ${this.typeToString(args[i])}`);
            }
        }

        return funcType.returnType;
    }

    // Check negation expressions
    private checkNegationExpression(node: any): RustType {
        const operandType = this.checkNode(node.children[1]);
        const operator = extractTerminalValue(node.children[0]);

        if (operator === '!' && !this.typesMatch(operandType, BOOL_TYPE)) {
            this.errors.push(`Cannot apply ! to non-boolean type: ${this.typeToString(operandType)}`);
            return BOOL_TYPE;
        } else if (operator === '-') {
            if (!this.isNumericType(operandType)) {
                this.errors.push(`Cannot apply - to non-numeric type: ${this.typeToString(operandType)}`);
            }
            return operandType;
        }

        return operandType;
    }

    // Check expression statements
    private checkExpressionStatement(node: any): RustType {
        return this.checkNode(node.children[0]);
    }

    // Helper method to check binary operations
    private checkBinaryOperation(leftType: RustType, rightType: RustType, operator: string): RustType {
        // Different handling based on operator
        switch (operator) {
            case '+':
            case '-':
            case '*':
            case '/':
            case '%':
                // Numeric operations
                if (!this.isNumericType(leftType)) {
                    this.errors.push(`Left operand of ${operator} must be numeric, got ${this.typeToString(leftType)}`);
                }
                if (!this.isNumericType(rightType)) {
                    this.errors.push(`Right operand of ${operator} must be numeric, got ${this.typeToString(rightType)}`);
                }
                // Result type is the "wider" of the two types
                return this.getWiderNumericType(leftType, rightType);

            case '|':
            case '&':
            case '&&':
            case '||':
                // Boolean operations
                if (!this.typesMatch(leftType, BOOL_TYPE)) {
                    this.errors.push(`Left operand of ${operator} must be boolean, got ${this.typeToString(leftType)}`);
                }
                if (!this.typesMatch(rightType, BOOL_TYPE)) {
                    this.errors.push(`Right operand of ${operator} must be boolean, got ${this.typeToString(rightType)}`);
                }
                return BOOL_TYPE;

            default:
                this.errors.push(`Unknown binary operator: ${operator}`);
                return UNIT_TYPE;
        }
    }

    // Helper method to convert RustType to string
    private typeToString(type: RustType): string {
        switch (type.kind) {
            case 'primitive':
                return type.name;
            case 'function':
                const paramTypes = type.params.map(p => this.typeToString(p)).join(', ');
                return `fn(${paramTypes}) -> ${this.typeToString(type.returnType)}`;
            default:
                return 'unknown';
        }
    }

    // Helper method to check if types match
    private typesMatch(actual: RustType, expected: RustType): boolean {
        // Handle primitive types first
        if (actual.kind === 'primitive' && expected.kind === 'primitive') {
            return actual.name === expected.name;
        }

        // Handle function types
        if (actual.kind === 'function' && expected.kind === 'function') {
            return (
                this.typesMatch(actual.returnType, expected.returnType) &&
                actual.params.length === expected.params.length &&
                actual.params.every((t, i) => this.typesMatch(t, expected.params[i]))
            );
        }

        // Types don't match if none of the above cases
        return false;
    }

    // Helper method for comparison type checking
    private typesMatchForComparison(left: RustType, right: RustType): boolean {
        // Same types can always be compared
        if (this.typesMatch(left, right)) return true;

        // Both numeric types can be compared
        if (this.isNumericType(left) && this.isNumericType(right)) return true;

        return false;
    }

    // Helper method to check if a type is numeric
    private isNumericType(type: RustType): boolean {
        return type.kind === 'primitive' &&
            ['i32', 'f32',].includes(type.name);
    }

    // Helper method to get the wider of two numeric types
    private getWiderNumericType(type1: RustType, type2: RustType): RustType {
        if (!this.isNumericType(type1) || !this.isNumericType(type2)) {
            return type1; // Default to first type if either is not numeric
        }

        // Simple widening rules
        if (type1.kind === 'primitive' && type2.kind === 'primitive') {
            if (type1.name === 'f32' || type2.name === 'f32') return F32_TYPE;
            return type1;
        }

        return type1; // Default to first type
    }

    private checkGroupedExpression(node: any): RustType {
        return this.checkNode(node.children[1]);
    }

    private scanFunctions(node: any): any[] {
        if (!node) return [];

        if ((node.tag === "Function_")) {
            return [node];
        }

        if (node.children && node.children.length > 0) {
            return node.children.reduce((acc, child) => {
                return acc.concat(this.scanFunctions(child));
            }, []);
        }

        return [];
    }

    // Helper method to register function signature
    private registerFunctionSignature(functionNode: any): void {
        const funcName = extractTerminalValue(findNodeByTag(functionNode, 'Identifier'));
        const params = getFunctionParams(functionNode);
        const returnTypeStr = getReturnType(functionNode);
        const returnType = parseTypeString(returnTypeStr);

        // Create function type
        const paramTypes = params.map(p => p.type);
        const funcType: RustType = {
            kind: 'function',
            params: paramTypes,
            returnType
        };

        // Add function to type environment
        this.env.define(funcName, funcType);
    }
}

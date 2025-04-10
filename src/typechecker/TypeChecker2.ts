import { extractTerminalValue, findNodeByTag, getFunctionParams, getReturnType } from "../compiler/CompilerHelper";
import { error, extend, getMainFunction, head, pair, Pair, scan, tail } from "../Utils";
import { extend_type_environment, GLOBAL_TYPE_ENVIRONMENT, lookup_type, TypeEnv } from "./TypeEnv";
import { BOOL_TYPE, CHAR_TYPE, F32_TYPE, I32_TYPE, RustType, STR_TYPE, UNIT_TYPE } from "./Types";

export class TypeChecker2 {

    check(ast: any): RustType {
        return this.checkNode(ast, GLOBAL_TYPE_ENVIRONMENT);
    }

    public checkNode(node: any, te: TypeEnv): RustType {
        if (!node) return UNIT_TYPE;

        switch (node.tag) {
            case 'Crate':
                return this.checkCrate(node, te);
            case 'Function_':
                return this.checkFunction(node, te);
            case 'LetStatement':
                return this.checkLetStatement(node, te);
            case 'LiteralExpression':
                return this.checkLiteral(node, te);
            case 'PathExpression_':
                return this.checkPathExpression(node, te);
            case 'BlockExpression':
                return this.checkBlock(node, te);
            case 'ReturnExpression':
                return this.checkReturnExpression(node, te);
            case 'ArithmeticOrLogicalExpression':
                return this.checkArithmeticOrLogicalExpression(node, te);
            case 'ComparisonExpression':
                return this.checkComparisonExpression(node, te);
            case 'LazyBooleanExpression':
                return this.checkLazyBooleanExpression(node, te);
            case 'IfExpression':
                return this.checkIfExpression(node, te);
            case 'PredicateLoopExpression':
                return this.checkPredicateLoopExpression(node, te);
            case 'CallExpression':
                return this.checkCallExpression(node, te);
            case 'NegationExpression':
                return this.checkNegationExpression(node, te);
            case 'ExpressionStatement':
                return this.checkExpressionStatement(node, te);
            case 'GroupedExpression':
                return this.checkGroupedExpression(node, te);
            default:
                return this.checkChildren(node, te);
        }
    }

    // Check all child nodes and return the type of the last child
    private checkChildren(node: any, te: TypeEnv): RustType {
        if (!node.children || node.children.length === 0) {
            return UNIT_TYPE;
        }

        let lastType = UNIT_TYPE;
        for (const child of node.children) {
            lastType = this.checkNode(child, te);
        }
        return lastType;
    }

    // Crate is the root node, corresponds to a full program
    // Its type is the type of the main function
    private checkCrate(node: any, te: TypeEnv): RustType {
        const functionNodes = this.scanFunctions(node);
        let funcNames: string[] = [];
        let funcTypes: RustType[] = [];

        // 2-phase approach necessary cus with mutual recursion, each function needs to 
        // know about the other before either body is fully type-checked.
        // Phase 1: Register all function signatures first
        for (const func of functionNodes) {
            const funcName = extractTerminalValue(findNodeByTag(func, 'Identifier'));
            const params = getFunctionParams(func);
            const returnTypeStr = getReturnType(func);
            const returnType = this.parseTypeString(returnTypeStr);

            // Create function type
            const paramTypes = params.map(p => this.parseTypeString(p.type));
            const funcType: RustType = {
                kind: 'function',
                params: paramTypes,
                returnType
            };

            funcNames.push(funcName);
            funcTypes.push(funcType);
        }
        const extended_te = extend_type_environment(funcNames, funcTypes, te);

        // Phase 2: Check all function bodies
        for (const func of functionNodes) {
            const funcName = extractTerminalValue(findNodeByTag(func, 'Identifier'));
            if (funcName !== 'main') {  // Skip main, we'll handle it separately
                this.checkNode(func, extended_te);
            }
        }

        // Special handling for main function
        const mainFunction = getMainFunction(node);
        if (!mainFunction) {
            error('No main function found');
        }

        // Check main function - its type is the type of its body
        return this.checkNode(mainFunction, extended_te);
    }

    // Check function declaration
    private checkFunction(node: any, te: TypeEnv): RustType {
        const funcName = extractTerminalValue(findNodeByTag(node, 'Identifier'));
        const funcType = lookup_type(funcName, te);

        if (!funcType || funcType.kind !== 'function') {
            error(`Function ${funcName} not properly registered`);
        }

        // Special handling for main function
        if (funcName === 'main') {
            const bodyNode = findNodeByTag(node, 'BlockExpression');
            return this.checkNode(bodyNode, te);
        }

        // Regular function handling (previously in checkFunctionBody)
        const params = getFunctionParams(node);

        // Check function body with parameter types in scope
        const extended_te = extend_type_environment(
            params.map(p => p.name),
            params.map(p => this.parseTypeString(p.type)),
            te);

        const bodyNode = findNodeByTag(node, 'BlockExpression');
        const bodyType = this.checkNode(bodyNode, extended_te);

        // Verify return type matches
        if (!this.typesMatch(bodyType, funcType.returnType)) {
            error(`Function ${funcName} returns ${this.typeToString(bodyType)}, but its declared return type is ${this.typeToString(funcType.returnType)}`);
        }

        return funcType;
    }

    // Check let statement
    private checkLetStatement(node: any, te: TypeEnv): RustType {
        const nameNode = findNodeByTag(node, 'Identifier');
        const name = extractTerminalValue(nameNode);

        // Find type annotation if exists
        let declaredType: RustType | null = null;
        let inferredType: RustType;
        const typeNode = findNodeByTag(node, 'Type_');

        // If type annotation exists, check type compatibility
        if (typeNode) {
            const typeStr = extractTerminalValue(typeNode);
            declaredType = this.parseTypeString(typeStr);

            // Check expression type (right of '=')
            inferredType = this.checkNode(node.children[5], te);

            // Verify type if explicitly declared
            if (declaredType && !this.typesMatch(inferredType, declaredType)) {
                error(`Cannot assign value of type ${this.typeToString(inferredType)} to variable ${name} of type ${this.typeToString(declaredType)}`);
            }
        } else { // If there is no type annotation
            inferredType = this.checkNode(node.children[3], te);
        }

        te = extend_type_environment([name], [inferredType], te);
        return UNIT_TYPE;
    }

    // Check literals
    private checkLiteral(node: any, te: TypeEnv): RustType {
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
    private checkPathExpression(node: any, te: TypeEnv): RustType {
        const symVal = extractTerminalValue(node);
        return lookup_type(symVal, te);
    }

    // Check block expressions
    private checkBlock(node: any, te: TypeEnv): RustType {
        const statementsNode = findNodeByTag(node, 'Statements');
        const names = scan(statementsNode);
        const extended_te = extend_type_environment(names, names.map(_ => UNIT_TYPE), te);
        return this.checkNode(statementsNode, extended_te);

    }

    // Check return expressions
    private checkReturnExpression(node: any, te: TypeEnv): RustType {
        if (node.children.length <= 1) {
            return UNIT_TYPE;
        }

        // Check the return value expression
        return this.checkNode(node.children[1], te);
    }

    // Check arithmetic and logical expressions
    private checkArithmeticOrLogicalExpression(node: any, te: TypeEnv): RustType {
        const leftType = this.checkNode(node.children[0], te);
        const rightType = this.checkNode(node.children[2], te);
        const operator = extractTerminalValue(node.children[1]);

        return this.checkBinaryOperation(leftType, rightType, operator);
    }

    // Check comparison expressions
    private checkComparisonExpression(node: any, te: TypeEnv): RustType {
        const leftType = this.checkNode(node.children[0], te);
        const rightType = this.checkNode(node.children[2], te);
        const operator = extractTerminalValue(node.children[1]);

        // All comparison operators return boolean
        if (!this.typesMatchForComparison(leftType, rightType)) {
            error(`Cannot compare ${this.typeToString(leftType)} with ${this.typeToString(rightType)}`);
        }

        return BOOL_TYPE;
    }

    // Check lazy boolean expressions (&&, ||)
    private checkLazyBooleanExpression(node: any, te: TypeEnv): RustType {
        const leftType = this.checkNode(node.children[0], te);
        const rightType = this.checkNode(node.children[2], te);
        const operator = extractTerminalValue(node.children[1]);

        if (!this.typesMatch(leftType, BOOL_TYPE)) {
            error(`Left operand of ${operator} must be boolean, got ${this.typeToString(leftType)}`);
        }

        if (!this.typesMatch(rightType, BOOL_TYPE)) {
            error(`Right operand of ${operator} must be boolean, got ${this.typeToString(rightType)}`);
        }

        return BOOL_TYPE;
    }

    // Check if expressions
    private checkIfExpression(node: any, te: TypeEnv): RustType {
        const conditionType = this.checkNode(node.children[1], te);

        if (!this.typesMatch(conditionType, BOOL_TYPE)) {
            error(`If condition must be boolean, got ${this.typeToString(conditionType)}`);
        }

        const thenType = this.checkNode(node.children[2], te);

        // Check else block if it exists
        if (node.children.length > 4) {
            const elseType = this.checkNode(node.children[4], te);

            // If there's an else branch, the result type is the common type of both branches
            if (!this.typesMatch(thenType, elseType)) {
                error(`Mismatched types in if/else expression: ${this.typeToString(thenType)} vs ${this.typeToString(elseType)}`);
                // Return the 'then' type as a fallback
                return thenType;
            }
        }

        return thenType;
    }

    // Check while loops
    private checkPredicateLoopExpression(node: any, te: TypeEnv): RustType {
        const conditionType = this.checkNode(node.children[1], te);

        if (!this.typesMatch(conditionType, BOOL_TYPE)) {
            error(`Loop condition must be boolean, got ${this.typeToString(conditionType)}`);
        }

        this.checkNode(node.children[2], te); // Check the body
        return UNIT_TYPE; // Loops always return the unit type
    }

    // Check function calls
    private checkCallExpression(node: any, te: TypeEnv): RustType {
        // First child should be the function identifier
        const funcNode = node.children[0];
        const funcType = this.checkNode(funcNode, te);

        if (funcType.kind !== 'function') {
            error(`Cannot call non-function type: ${this.typeToString(funcType)}`);
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
                    args.push(this.checkNode(child, te));
                }
            }
        }

        // Check number of arguments matches function signature
        if (args.length !== funcType.params.length) {
            error(`Function expected ${funcType.params.length} arguments but got ${args.length}`);
        }

        // Check each argument type
        for (let i = 0; i < args.length; i++) {
            if (!this.typesMatch(args[i], funcType.params[i])) {
                error(`Function argument ${i + 1} expected ${this.typeToString(funcType.params[i])} but got ${this.typeToString(args[i])}`);
            }
        }

        return funcType.returnType;
    }

    // Check negation expressions
    private checkNegationExpression(node: any, te: TypeEnv): RustType {
        const operandType = this.checkNode(node.children[1], te);
        const operator = extractTerminalValue(node.children[0]);

        if (operator === '!' && !this.typesMatch(operandType, BOOL_TYPE)) {
            error(`Cannot apply ! to non-boolean type: ${this.typeToString(operandType)}`);
            return BOOL_TYPE;
        } else if (operator === '-') {
            if (!this.isNumericType(operandType)) {
                error(`Cannot apply - to non-numeric type: ${this.typeToString(operandType)}`);
            }
            return operandType;
        }

        return operandType;
    }

    // Check expression statements
    private checkExpressionStatement(node: any, te: TypeEnv): RustType {
        return this.checkNode(node.children[0], te);
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
                    error(`Left operand of ${operator} must be numeric, got ${this.typeToString(leftType)}`);
                }
                if (!this.isNumericType(rightType)) {
                    error(`Right operand of ${operator} must be numeric, got ${this.typeToString(rightType)}`);
                }
                // Result type is the "wider" of the two types
                return this.getWiderNumericType(leftType, rightType);

            case '|':
            case '&':
            case '&&':
            case '||':
                // Boolean operations
                if (!this.typesMatch(leftType, BOOL_TYPE)) {
                    error(`Left operand of ${operator} must be boolean, got ${this.typeToString(leftType)}`);
                }
                if (!this.typesMatch(rightType, BOOL_TYPE)) {
                    error(`Right operand of ${operator} must be boolean, got ${this.typeToString(rightType)}`);
                }
                return BOOL_TYPE;

            default:
                error(`Unknown binary operator: ${operator}`);
                return UNIT_TYPE;
        }
    }

    // Helper method to parse type strings into RustType
    private parseTypeString(typeStr: string): RustType {
        if (!typeStr) return UNIT_TYPE;

        typeStr = typeStr.trim();

        switch (typeStr) {
            case 'i32': return I32_TYPE;
            case 'f32': return F32_TYPE;
            case 'bool': return BOOL_TYPE;
            case 'str': return STR_TYPE;
            case 'char': return CHAR_TYPE;
            case '()': return UNIT_TYPE;
            default:
                // Handle references
                if (typeStr.startsWith('&mut ')) {
                    return {
                        kind: 'reference',
                        target: this.parseTypeString(typeStr.substring(5)),
                        mutable: true
                    };
                }
                if (typeStr.startsWith('&')) {
                    return {
                        kind: 'reference',
                        target: this.parseTypeString(typeStr.substring(1)),
                        mutable: false
                    };
                }

                // Handle arrays
                if (typeStr.startsWith('[') && typeStr.includes(';')) {
                    const parts = typeStr.slice(1, -1).split(';');
                    const elementType = this.parseTypeString(parts[0].trim());
                    const size = parseInt(parts[1].trim(), 10);
                    return {
                        kind: 'array',
                        elementType,
                        size: isNaN(size) ? null : size
                    };
                }

                // Default to i32 for unrecognized types
                error(`Unknown type: ${typeStr}, defaulting to i32`);
                return I32_TYPE;
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
            case 'array':
                const sizeStr = type.size !== null ? `; ${type.size}` : '';
                return `[${this.typeToString(type.elementType)}${sizeStr}]`;
            case 'reference':
                const mutStr = type.mutable ? 'mut ' : '';
                return `&${mutStr}${this.typeToString(type.target)}`;
            case 'generic':
                return type.name;
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

        // Handle reference types
        if (actual.kind === 'reference' && expected.kind === 'reference') {
            return (
                actual.mutable === expected.mutable &&
                this.typesMatch(actual.target, expected.target)
            );
        }

        // Handle function types
        if (actual.kind === 'function' && expected.kind === 'function') {
            return (
                this.typesMatch(actual.returnType, expected.returnType) &&
                actual.params.length === expected.params.length &&
                actual.params.every((t, i) => this.typesMatch(t, expected.params[i]))
            );
        }

        // Handle array types
        if (actual.kind === 'array' && expected.kind === 'array') {
            return (
                this.typesMatch(actual.elementType, expected.elementType) &&
                (actual.size === expected.size ||
                    actual.size === null ||
                    expected.size === null)
            );
        }

        // Handle generic types
        if (actual.kind === 'generic' && expected.kind === 'generic') {
            return actual.name === expected.name;
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

    private checkGroupedExpression(node: any, te: TypeEnv): RustType {
        return this.checkNode(node.children[1], te);
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
    private registerFunctionSignature(node: any, te: TypeEnv): TypeEnv {
        const funcName = extractTerminalValue(findNodeByTag(node, 'Identifier'));
        const params = getFunctionParams(node);
        const returnTypeStr = getReturnType(node);
        const returnType = this.parseTypeString(returnTypeStr);

        // Create function type
        const paramTypes = params.map(p => this.parseTypeString(p.type));
        const funcType: RustType = {
            kind: 'function',
            params: paramTypes,
            returnType
        };

        // Add function to type environment
        return extend_type_environment([funcName], [funcType], te)
    }
}

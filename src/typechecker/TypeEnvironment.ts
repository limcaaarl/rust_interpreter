import { RustType } from "./Types";

/**
 * A simple stack-based type environment.  Each scope is a Map of names to
 * types.  The topmost scope is the current scope, and `enterScope` and
 * `exitScope` allow you to push and pop new scopes.
 */
export class TypeEnvironment {
    /**
     * The stack of scopes.  Each scope is a Map of names to types.  The
     * topmost scope is the current scope.
     */
    private scopes: Map<string, RustType>[] = [];

    /**
     * Create a new type environment with a single global scope.
     */
    constructor() {
        // Start with global scope
        this.enterScope();
    }

    /**
     * Enter a new scope.  This is done by pushing a new empty scope onto the
     * stack.
     */
    enterScope(): void {
        this.scopes.unshift(new Map());
    }

    /**
     * Exit the current scope.  This is done by popping the topmost scope from
     * the stack.  If there is only one scope, do nothing.
     */
    exitScope(): void {
        if (this.scopes.length > 1) {
            this.scopes.shift();
        }
    }

    /**
     * Define a new name in the current scope.
     *
     * @param name The name to define.
     * @param type The type to associate with the name.
     */
    define(name: string, type: RustType): void {
        this.scopes[0].set(name, type);
    }

    /**
     * Look up a name in the current scope.  If the name is not found in the
     * current scope, try the next scope, and so on.
     *
     * @param name The name to look up.
     * @return The type associated with the name, or null if the name is not
     * found.
     */
    lookup(name: string): RustType | null {
        for (const scope of this.scopes) {
            if (scope.has(name)) {
                return scope.get(name)!;
            }
        }
        return null;
    }
}

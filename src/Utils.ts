export class Pair {
    constructor(public head: any, public tail: any) { }
}

export function head(p: Pair): any {
    return p.head;
}

export function tail(p: Pair): any {
    return p.tail;
}

export function pair(head: any, tail: any): Pair {
    return new Pair(head, tail);
}

export function error(message: string): never {
    throw new Error(message);
}

export function is_null(env: Pair): boolean {
    return env === null;
}

export function scan(node: any): any[] {
    // Base case: if the node is null or undefined
    if (!node) return [];

    // If this is an identifier tag, extract its value
    if (node.tag === "Identifier" && node.children && node.children.length > 0) {
        // The identifier's actual value is in a Terminal child node
        const terminal = node.children.find(child => child.tag === "Terminal");
        if (terminal && terminal.val) {
            return [terminal.val];
        }
        return [];
    }

    // If this node has children, recursively scan them
    if (node.children && node.children.length > 0) {
        return node.children.reduce((acc, child) => {
            return acc.concat(scan(child));
        }, []);
    }

    // If none of the above, return empty array
    return [];
}
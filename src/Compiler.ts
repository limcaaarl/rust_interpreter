import { ParseTree, ParserRuleContext, TerminalNode } from 'antlr4ng';

export class Compiler {
  astToJson(ctx: ParserRuleContext): any {
    return this.nodeToJson(ctx);
  }

  private nodeToJson(node: ParseTree): any {
    if (node instanceof TerminalNode) {
      return {
        type: 'Terminal',
        text: node.getText(),
        symbol: node.symbol.type
      };
    } else if (node instanceof ParserRuleContext) {
      const result: any = {
        type: this.getNodeType(node),
        children: []
      };
      for (let i = 0; i < node.getChildCount(); i++) {
        result.children.push(this.nodeToJson(node.getChild(i)));
      }
      return result;
    }
    return null;
  }

  private getNodeType(node: ParserRuleContext): string {
    return node.constructor.name.replace('Context', '');
  }
}

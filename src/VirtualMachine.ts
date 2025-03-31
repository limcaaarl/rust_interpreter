import { displayInstructions } from "./compiler/CompilerHelper";
import { Instruction } from "./compiler/Instruction";
import { head, pair, tail, Pair, error, is_null } from "./Utils";

export class VirtualMachine {
    // Frames are objects that map symbols (strings) to values.
    private global_frame: any = {}

    // An environment is null or a pair whose head is a frame 
    // and whose tail is an environment.
    private empty_environment: Pair = null
    private global_environment: Pair = pair(this.global_frame, this.empty_environment);

    // VM Registers
    private PC: number = 0;
    private OS: any[] = [];
    private E: Pair = this.global_environment;
    private RTS: any[] = [];
    private instr: Instruction[];

    constructor(instructions: Instruction[]) {
        this.instr = instructions;
    }

    private lookup(symbol: string, e: Pair): any {
        if (is_null(e))
            error('unbound name: ' + symbol)
        if (head(e).hasOwnProperty(symbol)) {
            const v = head(e)[symbol]
            if (this.is_unassigned(v))
                error('unassigned name: ' + symbol)
            return v
        }
        return this.lookup(symbol, tail(e))
    }

    private assign_value(x: string, v: any, e: Pair): void {
        if (is_null(e))
            error('unbound name: ' + x)
        if (head(e).hasOwnProperty(x)) {
            head(e)[x] = v
        } else {
            this.assign_value(x, v, tail(e))
        }
    }

    private extend(xs: string[], vs: any[], e: Pair): Pair {
        if (vs.length > xs.length) error('too many arguments')
        if (vs.length < xs.length) error('too few arguments')
        const new_frame = {}
        for (let i = 0; i < xs.length; i++)
            new_frame[xs[i]] = vs[i]
        return pair(new_frame, e)
    }

    // At the start of executing a block, local 
    // variables refer to unassigned values.
    private unassigned = { tag: 'unassigned' }

    private is_unassigned(v: any): boolean {
        return v !== null &&
            typeof v === "object" &&
            v.hasOwnProperty('tag') &&
            v.tag === 'unassigned'
    }

    // runs the machine code instructions
    public run(): any {
        // displayInstructions(this.instr);
        while (this.instr[this.PC].tag !== "DONE") {
            const currentInstr = this.instr[this.PC];
            // this.debugVm(currentInstr);
            this.microcode(currentInstr);
        }

        return this.peek();
    }

    // TODO: Implement all the necessary instructions
    private microcode(instr: Instruction): void {
        switch (instr.tag) {
            case "POP":
                this.PC++;
                this.OS.pop();
                break;
            case "LDC":
                this.PC++;
                this.OS.push(instr.val);
                break;
            case "LD":
                this.PC++;
                this.OS.push(this.lookup(instr.sym, this.E));
                break;
            case "ASSIGN":
                this.PC++;
                this.assign_value(instr.sym, this.peek(), this.E);
                break;
            case "ENTER_SCOPE":
                this.PC++;
                this.RTS.push({ tag: 'BLOCK_FRAME', env: this.E });
                const locals = instr.syms;
                const unassigneds = locals.map(_ => this.unassigned);
                this.E = this.extend(locals, unassigneds, this.E);
                break;
            case "EXIT_SCOPE":
                this.PC++;
                this.E = this.RTS.pop().env;
                break;
            default:
                throw new Error("Unknown instruction tag: " + instr.tag);
        }
    }

    private peek(): any {
        return this.OS[this.OS.length - 1];
    }

    private debugVm(currentInstr: Instruction): void {
        console.log(`PC: ${this.PC}, Instruction: ${JSON.stringify(currentInstr)}`);
        console.log("OS:", this.OS);
        console.log("E:", this.E);
        console.log("RTS:", this.RTS);
    }
}



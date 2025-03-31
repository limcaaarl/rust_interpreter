import { displayInstructions } from "./compiler/CompilerHelper";
import { Instruction } from "./compiler/Instruction";
import { head, pair, tail, Pair, error, is_null } from "./Utils";

// Frames are objects that map symbols (strings) to values.

const global_frame = {}

// An environment is null or a pair whose head is a frame 
// and whose tail is an environment.
const empty_environment = null
const global_environment = pair(global_frame, empty_environment);

const lookup = (symbol, e) => {
    if (is_null(e))
        error('unbound name: ' + symbol)
    if (head(e).hasOwnProperty(symbol)) {
        const v = head(e)[symbol]
        if (is_unassigned(v))
            error('unassigned name: ' + symbol)
        return v
    }
    return lookup(symbol, tail(e))
}

const assign_value = (x, v, e) => {
    if (is_null(e))
        error('unbound name: ' + x)
    if (head(e).hasOwnProperty(x)) {
        head(e)[x] = v
    } else {
        assign_value(x, v, tail(e))
    }
}

const extend = (xs, vs, e) => {
    if (vs.length > xs.length) error('too many arguments')
    if (vs.length < xs.length) error('too few arguments')
    const new_frame = {}
    for (let i = 0; i < xs.length; i++)
        new_frame[xs[i]] = vs[i]
    return pair(new_frame, e)
}

// At the start of executing a block, local 
// variables refer to unassigned values.
const unassigned = { tag: 'unassigned' }

const is_unassigned = v => {
    return v !== null &&
        typeof v === "object" &&
        v.hasOwnProperty('tag') &&
        v.tag === 'unassigned'
}

export class VirtualMachine {
    private PC: number = 0;
    private OS: any[] = [];
    private E: Pair = global_environment;
    private RTS: any[] = [];
    private instr: Instruction[];

    constructor(instructions: Instruction[]) {
        this.instr = instructions;
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
                // TODO: implement a lookup function to fetch variable value
                // this.OS.push(this.lookup(instr.sym));
                break;
            case "ASSIGN":
                this.PC++;
                this.assign_value(instr.sym, this.peek(), this.E);
                break;
            case "ENTER_SCOPE":
                this.PC++;
                this.RTS.push({ tag: 'BLOCK_FRAME', env: this.E });
                const locals = instr.syms;
                const unassigneds = locals.map(_ => unassigned);
                this.E = extend(locals, unassigneds, this.E);
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

    private assign_value(name: string, value: any, env: Pair): void {
        if (is_null(env))
            throw new Error('unbound name:' + name)
        if (head(env).hasOwnProperty(name)) {
            head(env)[name] = value
        } else {
            assign_value(name, value, tail(env))
        }
    }

    private debugVm(currentInstr: Instruction): void {
        console.log(`PC: ${this.PC}, Instruction: ${JSON.stringify(currentInstr)}`);
        console.log("OS:", this.OS);
        console.log("E:", this.E);
        console.log("RTS:", this.RTS);
    }
}



import { displayInstructions } from "./compiler/CompilerHelper";
import { Instruction } from "./compiler/Instruction";
import { head, pair, tail, Pair, error, is_null, extend, lookup, assign_value, UNASSIGNED } from "./Utils";

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
                this.OS.push(lookup(instr.sym, this.E));
                break;
            case "ASSIGN":
                this.PC++;
                assign_value(instr.sym, this.peek(), this.E);
                break;
            case "ENTER_SCOPE":
                this.PC++;
                this.RTS.push({ tag: 'BLOCK_FRAME', env: this.E });
                const locals = instr.syms;
                const unassigneds = locals.map(_ => UNASSIGNED);
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

    private debugVm(currentInstr: Instruction): void {
        console.log(`PC: ${this.PC}, Instruction: ${JSON.stringify(currentInstr)}`);
        console.log("OS:", this.OS);
        console.log("E:", this.E);
        console.log("RTS:", this.RTS);
    }
}



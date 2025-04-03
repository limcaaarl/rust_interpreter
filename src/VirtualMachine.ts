import { displayInstructions } from "./compiler/CompilerHelper";
import { Instruction } from "./compiler/Instruction";
import { pair, Pair, extend, lookup, assign_value, UNASSIGNED, apply_binop, apply_unop } from "./Utils";

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
            case "BINOP": {
                this.PC++;
                const result = apply_binop(instr.sym, this.OS.pop(), this.OS.pop());
                this.OS.push(result);
                break;
            }
            case "UNOP": {
                this.PC++;
                const result = apply_unop(instr.sym, this.OS.pop());
                this.OS.push(result);
                break;
            }
            case "JOF": {
                this.PC = this.OS.pop() ? this.PC + 1 : instr.addr;
                break;
            }
            case "GOTO": {
                this.PC = instr.addr;
                break;
            }
            case "LDF": {
                this.PC++;
                this.OS.push({
                    tag: "CLOSURE",
                    prms: instr.prms,
                    addr: instr.addr,
                    env: this.E,
                });
                break;
            }
            case "CALL": {
                const arity = instr.arity
                let args = []
                for (let i = arity - 1; i >= 0; i--)
                    args[i] = this.OS.pop()
                const sf = this.OS.pop()
                // TODO: Implement builtin functions
                // if (sf.tag === 'BUILTIN') {
                //     this.PC++
                //     return this.OS.push(apply_builtin(sf.sym, args))
                // }
                const params = sf.prms.map(param => param.name);
                this.RTS.push({tag: 'CALL_FRAME', addr: this.PC + 1, env: this.E})
                this.E = extend(params, args, sf.env)
                this.PC = sf.addr
                break;
            }
            case "RESET": {
                const top_frame = this.RTS.pop()
                if (top_frame.tag === 'CALL_FRAME') {
                    this.PC = top_frame.addr
                    this.E = top_frame.env
                }
                break;
            }
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



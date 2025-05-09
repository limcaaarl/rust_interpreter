import { TAGS } from "./NodeTags";
import { error } from "../Utils";

export class Heap {
    // VM Heap Management
    public HEAP_BOTTOM: any;
    public HEAP: DataView;
    public heap_size: number;
    public node_size: number = 10;
    public size_offset: number = 5;
    public free: any;
    public word_size: number = 8;
    private stringPool: any[] = [];

    // For literal values (False, True, etc.)
    public False: number;
    public True: number;
    public Unassigned: number;
    public Undefined: number;
    public Null: number;

    constructor() { }

    public init(heapsize_words: number) {
        this.HEAP_BOTTOM = undefined;

        this.HEAP = this.heap_make(heapsize_words);
        this.heap_size = heapsize_words;

        let i = 0;
        for (i = 0; i <= heapsize_words - this.node_size; i += this.node_size) {
            this.heap_set(i, i + this.node_size);
        }
        this.heap_set(i - this.node_size, -1);
        this.free = 0;

        this.allocate_literal_values();
        this.HEAP_BOTTOM = this.free;
    }

    public free_node(node: number) {
        this.heap_set(node, this.free);
        this.free = node;
    }

    public heap_make(words: number) {
        const data = new ArrayBuffer(words * this.word_size);
        const view = new DataView(data);
        return view;
    }

    public heap_allocate(tag: any, size: number) {
        if (size > this.node_size) {
            error("limitation: nodes cannot be larger than 10 words");
        }
        if (this.free === -1) {
            error("heap memory exhausted");
        }

        const address = this.free;
        this.free = this.heap_get(this.free); // next free
        this.HEAP.setInt8(address * this.word_size, tag);
        this.HEAP.setUint16(address * this.word_size + this.size_offset, size);
        return address;
    }

    public heap_get(address: number) {
        return this.HEAP.getFloat64(address * this.word_size);
    }

    public heap_get_string_hash(address) {
        return this.heap_get_4_bytes_at_offset(address, 1);
    }

    public heap_get_string_index(address) {
        return this.heap_get_2_bytes_at_offset(address, 5);
    }

    public heap_get_string(address) {
        return this.stringPool[this.heap_get_string_hash(address)][
            this.heap_get_string_index(address)
        ].string;
    }

    public heap_set(address: number, x: any) {
        this.HEAP.setFloat64(address * this.word_size, x);
    }

    public heap_get_child(address: number, child_index: number) {
        return this.heap_get(address + 1 + child_index);
    }

    public heap_set_child(address: number, child_index: number, value: number) {
        this.heap_set(address + 1 + child_index, value);
    }

    public heap_get_tag(address: number) {
        return this.HEAP.getInt8(address * this.word_size);
    }

    public heap_get_size(address: number) {
        return this.HEAP.getUint16(address * this.word_size + this.size_offset);
    }

    public heap_get_number_of_children(address: number): number {
        if (this.heap_get_tag(address) === TAGS.Number_tag) {
            return 0;
        } else {
            return this.heap_get_size(address) - 1;
        }
    }

    public heap_set_byte_at_offset(
        address: number,
        offset: number,
        value: number
    ): void {
        this.HEAP.setUint8(address * this.word_size + offset, value);
    }

    public heap_get_byte_at_offset(address: number, offset: number): number {
        return this.HEAP.getUint8(address * this.word_size + offset);
    }

    public heap_set_2_bytes_at_offset(
        address: number,
        offset: number,
        value: number
    ): void {
        this.HEAP.setUint16(address * this.word_size + offset, value);
    }

    public heap_get_2_bytes_at_offset(address: number, offset: number): number {
        return this.HEAP.getUint16(address * this.word_size + offset);
    }

    public heap_set_4_bytes_at_offset(address, offset, value) {
        return this.HEAP.setUint32(address * this.word_size + offset, value);
    }

    public heap_get_4_bytes_at_offset(address, offset) {
        return this.HEAP.getUint32(address * this.word_size + offset);
    }

    public word_to_string(word): string {
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        view.setFloat64(0, word);
        let binStr = "";
        for (let i = 0; i < 8; i++) {
            binStr +=
                ("00000000" + view.getUint8(i).toString(2)).slice(-8) + " ";
        }
        return binStr;
    }

    public allocate_literal_values() {
        this.False = this.heap_allocate(TAGS.False_tag, 1);
        this.True = this.heap_allocate(TAGS.True_tag, 1);
        this.Null = this.heap_allocate(TAGS.Null_tag, 1);
        this.Unassigned = this.heap_allocate(TAGS.Unassigned_tag, 1);
        this.Undefined = this.heap_allocate(TAGS.Undefined_tag, 1);
    }

    public heap_allocate_Builtin(id) {
        const address = this.heap_allocate(TAGS.Builtin_tag, 1);
        this.heap_set_byte_at_offset(address, 1, id);
        return address;
    }

    public heap_get_Builtin_id(address) {
        return this.heap_get_byte_at_offset(address, 1);
    }

    // Closures
    public heap_allocate_Closure(arity: number, pc: number, env: any): number {
        const address = this.heap_allocate(TAGS.Closure_tag, 2);
        this.heap_set_byte_at_offset(address, 1, arity);
        this.heap_set_2_bytes_at_offset(address, 2, pc);
        this.heap_set(address + 1, env);
        return address;
    }

    public heap_get_Closure_arity(address: number): number {
        return this.heap_get_byte_at_offset(address, 1);
    }

    public heap_get_Closure_pc(address: number): number {
        return this.heap_get_2_bytes_at_offset(address, 2);
    }

    public heap_get_Closure_environment(address: number): number {
        return this.heap_get_child(address, 0);
    }

    public is_Closure(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Closure_tag;
    }

    // Blockframe
    public heap_allocate_Blockframe(env: any): number {
        const address = this.heap_allocate(TAGS.Blockframe_tag, 2);
        this.heap_set(address + 1, env);
        return address;
    }

    public heap_get_Blockframe_environment(address: number) {
        return this.heap_get_child(address, 0);
    }

    public is_Blockframe(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Blockframe_tag;
    }

    // Callframe
    public heap_allocate_Callframe(env: any, pc: number): number {
        const address = this.heap_allocate(TAGS.Callframe_tag, 2);
        this.heap_set_2_bytes_at_offset(address, 2, pc);
        this.heap_set(address + 1, env);
        return address;
    }

    public heap_get_Callframe_environment(address: number) {
        return this.heap_get_child(address, 0);
    }

    public heap_get_Callframe_pc(address: number): number {
        return this.heap_get_2_bytes_at_offset(address, 2);
    }

    public is_Callframe(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Callframe_tag;
    }

    // Frame
    public heap_allocate_Frame(number_of_values: number): number {
        return this.heap_allocate(TAGS.Frame_tag, number_of_values + 1);
    }

    public heap_Frame_display(address: number): void {
        console.log("Frame:");
        const size = this.heap_get_number_of_children(address);
        for (let i = 0; i < size; i++) {
            const value = this.heap_get_child(address, i);
        }
    }

    // Environment
    public heap_allocate_Environment(number_of_frames: number) {
        return this.heap_allocate(TAGS.Environment_tag, number_of_frames + 1);
    }

    public heap_get_Environment_value(
        env_address: any,
        position: [number, number]
    ): number {
        const [frame_index, value_index] = position;
        const frameCount = this.heap_get_number_of_children(env_address);
        if (frame_index >= frameCount) {
            error("unbound name: variable not in environment");
        }
        const frame_address = this.heap_get_child(env_address, frame_index);
        return this.heap_get_child(frame_address, value_index);
    }

    public heap_set_Environment_value(
        env_address: any,
        position: [number, number],
        value: number
    ): void {
        const [frame_index, value_index] = position;
        const frame_address = this.heap_get_child(env_address, frame_index);
        this.heap_set_child(frame_address, value_index, value);
    }

    public heap_Environment_extend(
        frame_address: number,
        env_address: any
    ): number {
        const old_size = this.heap_get_size(env_address);

        const new_env_address = this.heap_allocate_Environment(old_size);

        let i: number;
        for (i = 0; i < old_size - 1; i++) {
            this.heap_set_child(
                new_env_address,
                i,
                this.heap_get_child(env_address, i)
            );
        }
        this.heap_set_child(new_env_address, i, frame_address);
        return new_env_address;
    }

    public heap_Environment_display(env_address: any): void {
        const size = this.heap_get_number_of_children(env_address);
        console.log("Environment:");
        for (let i = 0; i < size; i++) {
            const frame = this.heap_get_child(env_address, i);
            this.heap_Frame_display(frame);
        }
    }

    // Pair
    public heap_allocate_Pair(hd: number, tl: number): number {
        const pair_address = this.heap_allocate(TAGS.Pair_tag, 3);
        this.heap_set_child(pair_address, 0, hd);
        this.heap_set_child(pair_address, 1, tl);
        return pair_address;
    }

    public is_Pair(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Pair_tag;
    }

    public heap_allocate_Number(n: number): number {
        const number_address = this.heap_allocate(TAGS.Number_tag, 2);
        this.heap_set(number_address + 1, n);
        return number_address;
    }

    public hashString(s: string) {
        let hash = 5381;
        for (let i = 0; i < s.length; i++) {
            const char = s.charCodeAt(i);
            hash = (hash << 5) + hash + char;
            hash = hash & hash;
        }
        return hash >>> 0;
    }

    // Strings
    public heap_allocate_String(string) {
        const hash = this.hashString(string);
        const a = this.stringPool[hash];

        if (a !== undefined) {
            for (let i = 0; i < a.length; i++) {
                if (a[i].string === string) {
                    return a[i].address;
                }
            }
            const address = this.heap_allocate(TAGS.String_tag, 2);
            this.heap_set_4_bytes_at_offset(address, 1, hash);

            const newIndex = a.length;
            this.heap_set_2_bytes_at_offset(address, 5, newIndex);

            a.push({ address, string });
            return address;
        } else {
            const address = this.heap_allocate(TAGS.String_tag, 2);
            this.heap_set_4_bytes_at_offset(address, 1, hash);

            this.heap_set_2_bytes_at_offset(address, 5, 0);

            this.stringPool[hash] = [{ address, string }];
            return address;
        }
    }

    public heap_allocate_Reference(value: number[], mutable: boolean, environment: number): number {
        const reference_address = this.heap_allocate(TAGS.Reference_tag, 4);

        // Store frame index and value index instead of the value itself
        this.heap_set_child(reference_address, 0, value[0]); // frame index
        this.heap_set_child(reference_address, 1, value[1]); // value index
        this.heap_set_byte_at_offset(reference_address, 2, mutable ? 1 : 0); // mutability

        // Store the environment where the reference was created
        // As functions create new environments, the same position could refer to different values.
        // This ensures that we can properly dereference and update the reference.
        this.heap_set_child(reference_address, 2, environment);

        return reference_address;
    }

    public is_Reference(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Reference_tag;
    }

    public heap_get_Reference_value(address: number): number {
        // Get the frame and value indices stored in the reference
        const frameIndex = this.heap_get_child(address, 0);
        const valueIndex = this.heap_get_child(address, 1);

        // Use the environment stored with the reference if available
        // This allows us to retrieve the correct value even when the reference is 
        // accessed from a different environment (like inside a function call)
        const refEnvironment = this.heap_get_child(address, 2);

        // Use the reference's stored environment if available
        if (refEnvironment) {
            const frame_address = this.heap_get_child(refEnvironment, frameIndex);

            if (frame_address) {
                const value_address = this.heap_get_child(frame_address, valueIndex);
                return value_address;
            }
        }

        return this.Undefined;
    }

    public heap_set_Reference_value(address: number, value: number, environment: any): void {
        // Get location from reference
        const frameIndex = this.heap_get_child(address, 0);
        const valueIndex = this.heap_get_child(address, 1);

        // Use the environment stored with the reference if available
        const refEnvironment = this.heap_get_child(address, 2) || environment;

        const frameAddress = this.heap_get_child(refEnvironment, frameIndex);

        if (frameAddress) {
            this.heap_set_child(frameAddress, valueIndex, value);
        }
    }

    public is_Reference_mutable(address: number): boolean {
        return this.heap_get_byte_at_offset(address, 2) === 1;
    }

    // address <-> TS value conversion
    public address_to_TS_value(x: any): any {
        if (this.is_Boolean(x)) {
            return this.is_True(x) ? true : false;
        } else if (this.is_Number(x)) {
            return this.heap_get(x + 1);
        } else if (this.is_String(x)) {
            return this.heap_get_string(x);
        } else if (this.is_Undefined(x)) {
            return undefined;
        } else if (this.is_Unassigned(x)) {
            return "<unassigned>";
        } else if (this.is_Null(x)) {
            return null;
        } else if (this.is_Pair(x)) {
            const head = this.address_to_TS_value(this.heap_get_child(x, 0));
            const tail = this.address_to_TS_value(this.heap_get_child(x, 1));
            return [head, tail];
        } else if (this.is_Reference(x)) {
            return {
                type: "reference",
                value: this.address_to_TS_value(this.heap_get_Reference_value(x)),
                mutable: this.is_Reference_mutable(x),
            };
        } else if (this.is_Closure(x)) {
            return "<closure>";
        } else if (this.is_Builtin(x)) {
            return "<builtin>";
        } else {
            return "unknown word tag: " + this.word_to_string(x);
        }
    }

    public TS_value_to_address(x: any): any {
        if (this.is_boolean(x)) {
            return x ? this.True : this.False;
        } else if (this.is_number(x)) {
            return this.heap_allocate_Number(x);
        } else if (this.is_undefined(x)) {
            return this.Undefined;
        } else if (this.is_null(x)) {
            return this.Null;
        } else if (this.is_pair(x)) {
            return this.heap_allocate_Pair(
                this.TS_value_to_address(this.head(x)),
                this.TS_value_to_address(this.tail(x))
            );
        } else if (this.is_string(x)) {
            return this.heap_allocate_String(x);
        } else {
            // fallback
            return "unknown word tag: " + this.word_to_string(x);
        }
    }

    // Tag checkers
    public is_False = (address) =>
        this.heap_get_tag(address) === TAGS.False_tag;
    public is_True(address) {
        return this.heap_get_tag(address) === TAGS.True_tag;
    }
    public is_Boolean(address) {
        return this.is_True(address) || this.is_False(address);
    }
    public is_Null(address) {
        return this.heap_get_tag(address) === TAGS.Null_tag;
    }
    public is_Unassigned(address) {
        return this.heap_get_tag(address) === TAGS.Unassigned_tag;
    }
    public is_Undefined(address) {
        return this.heap_get_tag(address) === TAGS.Undefined_tag;
    }
    public is_Builtin(address) {
        return this.heap_get_tag(address) === TAGS.Builtin_tag;
    }
    public is_Number(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Number_tag;
    }
    public is_String(address) {
        return this.heap_get_tag(address) === TAGS.String_tag;
    }

    // TODO: Will this require some change after typechecker implementation?
    // TS type checks
    public is_boolean(x: any): x is boolean {
        return typeof x === "boolean";
    }
    public is_number(x: any): x is number {
        return typeof x === "number";
    }
    public is_undefined(x: any): x is undefined {
        return x === undefined;
    }
    public is_null(x: any): x is null {
        return x === null;
    }
    public is_string(x: any): x is string {
        return typeof x === "string";
    }
    public is_pair(x: any): boolean {
        return Array.isArray(x) && x.length === 2;
    }
    public head(pair: [any, any]): any {
        return pair[0];
    }
    public tail(pair: [any, any]): any {
        return pair[1];
    }
}

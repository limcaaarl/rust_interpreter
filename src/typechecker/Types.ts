export type RustType =
    | {
        kind: 'primitive',
        name: 'unit' |
        'i32' | 'f32' |
        'bool' |
        'char' | 'str'
    }
    | { kind: 'function', params: RustType[], returnType: RustType }
    | { kind: 'array', elementType: RustType, size: number | null }
    | { kind: 'reference', target: RustType, mutable: boolean }
    | { kind: 'generic', name: string };

export const UNIT_TYPE: RustType = { kind: 'primitive', name: 'unit' };
export const I32_TYPE: RustType = { kind: 'primitive', name: 'i32' };
export const F32_TYPE: RustType = { kind: 'primitive', name: 'f32' };
export const BOOL_TYPE: RustType = { kind: 'primitive', name: 'bool' };
export const STR_TYPE: RustType = { kind: 'primitive', name: 'str' };
export const CHAR_TYPE: RustType = { kind: 'primitive', name: 'char' };
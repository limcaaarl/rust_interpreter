import { error, head, is_null, Pair, pair, tail } from "../Utils"
import { RustType } from "./Types"

const empty_type_environment = null
export const GLOBAL_TYPE_ENVIRONMENT = pair({}, empty_type_environment)

export function lookup_type(x: string, e: Pair): RustType {
    return is_null(e)
        ? error("unbound name: " + x)
        : head(e).hasOwnProperty(x)
            ? head(e)[x]
            : lookup_type(x, tail(e))
}

export function extend_type_environment(names: string[], types: RustType[], e: Pair): Pair {
    if (types.length > names.length)
        error('too few parameters in function declaration')
    if (types.length < names.length)
        error('too many parameters in function declaration')
    const new_frame = {}
    for (let i = 0; i < names.length; i++)
        new_frame[names[i]] = types[i]
    return pair(new_frame, e)
}

export type TypeEnv = Pair
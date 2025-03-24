import { initialise } from "conductor/src/conductor/runner/util";
import { RustEvaluator } from "./RustEvaluator";

const {runnerPlugin, conduit} = initialise(RustEvaluator);
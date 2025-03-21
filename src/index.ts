import { initialise } from "conductor/src/conductor/runner/util";
import { SimpleLangEvaluator } from "./SimpleLangEvaluator";

const {runnerPlugin, conduit} = initialise(SimpleLangEvaluator);
import {URL} from "node:url";

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@dietdev/canvas") {
    return nextResolve(new URL("../src/index.ts", import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}

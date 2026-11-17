export function computerChangeDestination(pathname: string, hasActiveComputer: boolean) {
  return pathname.startsWith("/settings") ? "/settings-tab" : hasActiveComputer ? "/chat" : "/";
}

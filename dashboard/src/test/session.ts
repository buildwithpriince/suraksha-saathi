import { backend } from "../api";
import { MOCK_PASSWORD } from "../auth/mock";

export async function signInAs(email: "admin@demo.suraksha" | "supervisor@demo.suraksha" = "admin@demo.suraksha") {
  await backend.auth.signIn(email, MOCK_PASSWORD);
}

export async function signOut() {
  await backend.auth.signOut();
}

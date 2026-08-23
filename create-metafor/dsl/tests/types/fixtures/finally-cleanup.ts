export async function release<m extends object, e extends object>(input: {
  mass: m
  energy: e
}): Promise<void> {
  void input.mass
  void input.energy
}

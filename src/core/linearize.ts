/**
 * Reverse Postorder: Vorgänger stehen vor Nachfolgern (Rücksprünge ausgenommen),
 * Zweige bleiben zusammen, und gemeinsame Fortsetzungen folgen erst nach allen Zweigen.
 */
export function reversePostorder<T>(roots: readonly T[], successors: (node: T) => readonly T[], seen: Set<T>): T[] {
  const post: T[] = [];
  const visit = (node: T): void => {
    if (seen.has(node)) return;
    seen.add(node);
    for (const next of [...successors(node)].reverse()) visit(next);
    post.push(node);
  };
  for (const root of [...roots].reverse()) visit(root);
  return post.reverse();
}

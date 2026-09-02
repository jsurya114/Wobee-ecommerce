import { Spinner } from "@woobe/ui";

/** The one loading treatment every admin list/detail page uses instead of a bare "Loading…" string. */
export function LoadingState() {
  return (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );
}

import { draftMode } from "next/headers";
import { redirect } from "next/navigation";

/** Leaves draft preview and returns to the content list (or a safe page on the site). */
export async function GET(request: Request) {
  (await draftMode()).disable();
  const back = new URL(request.url).searchParams.get("back");
  redirect(back && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(back) ? back : "/admin/content");
}

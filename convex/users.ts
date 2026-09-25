// Users functions (store, current)

import { mutation, query } from "./_generated/server";
import { hasProPlan, verifyAuth } from "./auth";

//#region store (upsert the signed-in user)
//Called from the browser once Convex has a Clerk identity (see "UserSync").
//
//Why take NO arguments?
//Everything comes from the verified Clerk JWT ("identity"), never from the
//client. If the browser could send its own email, anyone could claim someone
//else's address and accept that person's team invites.
//
//The email is only present if the Clerk JWT template named "convex" includes
//the "email" claim (Clerk's default Convex template does). If it's missing we
//fail loudly instead of saving a user nobody can invite.
//#endregion
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    if (!identity.email) {
      throw new Error(
        'Missing "email" claim — add it to the "convex" JWT template in Clerk',
      );
    }

    const fields = {
      email: identity.email.toLowerCase(),
      name: identity.name,
      imageUrl: identity.pictureUrl,
      isPro: hasProPlan(identity),
      updatedAt: Date.now(),
    };

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    //Returning user -> refresh profile fields (email/name/avatar can change in Clerk)
    if (existing) {
      await ctx.db.patch("users", existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      ...fields,
    });
  },
});

//The signed-in user's row (null until "store" has run for the first time)
export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

//#region tokenIsPro
//Is the caller Pro according to the token CONVEX currently holds?
//Queries re-run when the client re-authenticates, so this flips exactly when
//Convex has the post-upgrade/downgrade token. "UserSync" waits for it before
//re-running "store" — reacting to Clerk's claims instead would race, because
//Clerk sees the new plan a moment before Convex does, and "store" would save
//the old one.
//#endregion
export const tokenIsPro = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);
    return hasProPlan(identity);
  },
});

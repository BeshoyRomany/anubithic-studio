/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiCredentials from "../aiCredentials.js";
import type * as aiKeyProviders from "../aiKeyProviders.js";
import type * as aiKeyRotation from "../aiKeyRotation.js";
import type * as aiKeys from "../aiKeys.js";
import type * as aiSettings from "../aiSettings.js";
import type * as auth from "../auth.js";
import type * as contributors from "../contributors.js";
import type * as conversations from "../conversations.js";
import type * as files from "../files.js";
import type * as presence from "../presence.js";
import type * as projects from "../projects.js";
import type * as serverCredentials from "../serverCredentials.js";
import type * as system from "../system.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiCredentials: typeof aiCredentials;
  aiKeyProviders: typeof aiKeyProviders;
  aiKeyRotation: typeof aiKeyRotation;
  aiKeys: typeof aiKeys;
  aiSettings: typeof aiSettings;
  auth: typeof auth;
  contributors: typeof contributors;
  conversations: typeof conversations;
  files: typeof files;
  presence: typeof presence;
  projects: typeof projects;
  serverCredentials: typeof serverCredentials;
  system: typeof system;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

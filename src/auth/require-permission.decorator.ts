import type { UserPermission } from '@iveri/contracts';
import { SetMetadata } from '@nestjs/common';

/** Metadata key {@link PermissionGuard} reads. */
export const REQUIRED_PERMISSIONS_KEY = 'iveri:requiredPermissions';

/**
 * Declares the permissions a route needs. Enforced by `PermissionGuard`.
 *
 * Listing several means **all** of them are required, not any — the permissive reading is the
 * one that silently grants access, so the conservative default is the right one. A route that
 * genuinely wants "either of these" wants two routes, or a check inside the service where the
 * rule can be named.
 *
 * ```ts
 * @RequirePermission(UserPermission.UNIBOX_CONVERSATION_READ)
 * @Get(':conversationId')
 * ```
 */
export const RequirePermission = (...permissions: UserPermission[]): MethodDecorator & ClassDecorator =>
    SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

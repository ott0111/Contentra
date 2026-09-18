"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthorizationError = void 0;
exports.can = can;
exports.assertCan = assertCan;
var ROLE_PERMISSIONS = {
    OWNER: ['workspace.read', 'workspace.update', 'workspace.delete', 'members.read', 'members.invite', 'members.remove', 'content.read', 'content.create', 'content.update', 'content.delete', 'content.publish', 'analytics.read', 'brand.read', 'brand.update', 'billing.read', 'billing.manage', 'integrations.read', 'integrations.manage', 'api.manage', 'campaigns.manage'],
    ADMIN: ['workspace.read', 'workspace.update', 'members.read', 'members.invite', 'members.remove', 'content.read', 'content.create', 'content.update', 'content.delete', 'content.publish', 'analytics.read', 'brand.read', 'brand.update', 'billing.read', 'billing.manage', 'integrations.read', 'integrations.manage', 'api.manage', 'campaigns.manage'],
    MEMBER: ['workspace.read', 'members.read', 'content.read', 'content.create', 'content.update', 'content.publish', 'analytics.read', 'brand.read', 'brand.update', 'integrations.read', 'campaigns.manage'],
    VIEWER: ['workspace.read', 'content.read', 'analytics.read', 'brand.read']
};
function can(role, p) { return ROLE_PERMISSIONS[role].includes(p); }
function assertCan(role, p) { if (!can(role, p))
    throw new AuthorizationError('FORBIDDEN', "Missing permission: ".concat(p)); }
var AuthorizationError = /** @class */ (function (_super) {
    __extends(AuthorizationError, _super);
    function AuthorizationError(code, message) {
        var _this = _super.call(this, message) || this;
        _this.code = code;
        _this.name = 'AuthorizationError';
        return _this;
    }
    return AuthorizationError;
}(Error));
exports.AuthorizationError = AuthorizationError;

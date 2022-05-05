"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MojangRestAPI = exports.MojangStatusColor = void 0;
const LoggerUtil_1 = require("../../util/LoggerUtil");
const got_1 = __importStar(require("got"));
const MojangResponse_1 = require("./MojangResponse");
const RestResponse_1 = require("../../common/rest/RestResponse");
var MojangStatusColor;
(function (MojangStatusColor) {
    MojangStatusColor["RED"] = "red";
    MojangStatusColor["YELLOW"] = "yellow";
    MojangStatusColor["GREEN"] = "green";
    MojangStatusColor["GREY"] = "grey";
})(MojangStatusColor = exports.MojangStatusColor || (exports.MojangStatusColor = {}));
class MojangRestAPI {
    static getDefaultStatuses() {
        return [
            {
                service: 'session.minecraft.net',
                status: MojangStatusColor.GREY,
                name: 'Multiplayer Session Service',
                essential: true
            },
            {
                service: 'authserver.mojang.com',
                status: MojangStatusColor.GREY,
                name: 'Authentication Service',
                essential: true
            },
            {
                service: 'textures.minecraft.net',
                status: MojangStatusColor.GREY,
                name: 'Minecraft Skins',
                essential: false
            },
            {
                service: 'api.mojang.com',
                status: MojangStatusColor.GREY,
                name: 'Public API',
                essential: false
            },
            {
                service: 'minecraft.net',
                status: MojangStatusColor.GREY,
                name: 'Minecraft.net',
                essential: false
            },
            {
                service: 'account.mojang.com',
                status: MojangStatusColor.GREY,
                name: 'Mojang Accounts Website',
                essential: false
            }
        ];
    }
    /**
     * Converts a Mojang status color to a hex value. Valid statuses
     * are 'green', 'yellow', 'red', and 'grey'. Grey is a custom status
     * to our project which represents an unknown status.
     */
    static statusToHex(status) {
        switch (status.toLowerCase()) {
            case MojangStatusColor.GREEN:
                return '#a5c325';
            case MojangStatusColor.YELLOW:
                return '#eac918';
            case MojangStatusColor.RED:
                return '#c32625';
            case MojangStatusColor.GREY:
            default:
                return '#848484';
        }
    }
    /**
     * MojangRestAPI implementation of handleGotError. This function will additionally
     * analyze the response from Mojang and populate the mojang-specific error information.
     *
     * @param operation The operation name, for logging purposes.
     * @param error The error that occurred.
     * @param dataProvider A function to provide a response body.
     * @returns A MojangResponse configured with error information.
     */
    static handleGotError(operation, error, dataProvider) {
        const response = (0, RestResponse_1.handleGotError)(operation, error, MojangRestAPI.logger, dataProvider);
        if (error instanceof got_1.HTTPError) {
            response.mojangErrorCode = (0, MojangResponse_1.decipherErrorCode)(error.response.body);
        }
        else if (error.name === 'RequestError' && error.code === 'ENOTFOUND') {
            response.mojangErrorCode = MojangResponse_1.MojangErrorCode.ERROR_UNREACHABLE;
        }
        else {
            response.mojangErrorCode = MojangResponse_1.MojangErrorCode.UNKNOWN;
        }
        response.isInternalError = (0, MojangResponse_1.isInternalError)(response.mojangErrorCode);
        return response;
    }
    /**
     * Utility function to report an unexpected success code. An unexpected
     * code may indicate an API change.
     *
     * @param operation The operation name.
     * @param expected The expected response code.
     * @param actual The actual response code.
     */
    static expectSpecificSuccess(operation, expected, actual) {
        if (actual !== expected) {
            MojangRestAPI.logger.warn(`${operation} expected ${expected} response, recieved ${actual}.`);
        }
    }
    /**
     * Retrieves the status of Mojang's services.
     * The response is condensed into a single object. Each service is
     * a key, where the value is an object containing a status and name
     * property.
     *
     * @see http://wiki.vg/Mojang_API#API_Status
     */
    static async status() {
        try {
            const res = await MojangRestAPI.statusClient.get('check');
            MojangRestAPI.expectSpecificSuccess('Mojang Status', 200, res.statusCode);
            res.body.forEach(status => {
                const entry = Object.entries(status)[0];
                for (let i = 0; i < MojangRestAPI.statuses.length; i++) {
                    if (MojangRestAPI.statuses[i].service === entry[0]) {
                        MojangRestAPI.statuses[i].status = entry[1];
                        break;
                    }
                }
            });
            return {
                data: MojangRestAPI.statuses,
                responseStatus: RestResponse_1.RestResponseStatus.SUCCESS
            };
        }
        catch (error) {
            return MojangRestAPI.handleGotError('Mojang Status', error, () => {
                for (let i = 0; i < MojangRestAPI.statuses.length; i++) {
                    MojangRestAPI.statuses[i].status = MojangStatusColor.GREY;
                }
                return MojangRestAPI.statuses;
            });
        }
    }
    /**
     * Authenticate a user with their Mojang credentials.
     *
     * @param {string} username The user's username, this is often an email.
     * @param {string} password The user's password.
     * @param {string} clientToken The launcher's Client Token.
     * @param {boolean} requestUser Optional. Adds user object to the reponse.
     * @param {Object} agent Optional. Provided by default. Adds user info to the response.
     *
     * @see http://wiki.vg/Authentication#Authenticate
     */
    static async authenticate(username, password, clientToken, requestUser = true, agent = MojangRestAPI.MINECRAFT_AGENT) {
        try {
            const json = {
                agent,
                username,
                password,
                requestUser
            };
            if (clientToken != null) {
                json.clientToken = clientToken;
            }
            const res = await MojangRestAPI.authClient.post('authenticate', { json, responseType: 'json' });
            MojangRestAPI.expectSpecificSuccess('Mojang Authenticate', 200, res.statusCode);
            return {
                data: res.body,
                responseStatus: RestResponse_1.RestResponseStatus.SUCCESS
            };
        }
        catch (err) {
            return MojangRestAPI.handleGotError('Mojang Authenticate', err, () => null);
        }
    }
    /**
     * Validate an access token. This should always be done before launching.
     * The client token should match the one used to create the access token.
     *
     * @param {string} accessToken The access token to validate.
     * @param {string} clientToken The launcher's client token.
     *
     * @see http://wiki.vg/Authentication#Validate
     */
    static async validate(accessToken, clientToken) {
        try {
            const json = {
                accessToken,
                clientToken
            };
            const res = await MojangRestAPI.authClient.post('validate', { json });
            MojangRestAPI.expectSpecificSuccess('Mojang Validate', 204, res.statusCode);
            return {
                data: res.statusCode === 204,
                responseStatus: RestResponse_1.RestResponseStatus.SUCCESS
            };
        }
        catch (err) {
            if (err instanceof got_1.HTTPError && err.response.statusCode === 403) {
                return {
                    data: false,
                    responseStatus: RestResponse_1.RestResponseStatus.SUCCESS
                };
            }
            return MojangRestAPI.handleGotError('Mojang Validate', err, () => false);
        }
    }
    /**
     * Invalidates an access token. The clientToken must match the
     * token used to create the provided accessToken.
     *
     * @param {string} accessToken The access token to invalidate.
     * @param {string} clientToken The launcher's client token.
     *
     * @see http://wiki.vg/Authentication#Invalidate
     */
    static async invalidate(accessToken, clientToken) {
        try {
            const json = {
                accessToken,
                clientToken
            };
            const res = await MojangRestAPI.authClient.post('invalidate', { json });
            MojangRestAPI.expectSpecificSuccess('Mojang Invalidate', 204, res.statusCode);
            return {
                data: undefined,
                responseStatus: RestResponse_1.RestResponseStatus.SUCCESS
            };
        }
        catch (err) {
            return MojangRestAPI.handleGotError('Mojang Invalidate', err, () => undefined);
        }
    }
    /**
     * Refresh a user's authentication. This should be used to keep a user logged
     * in without asking them for their credentials again. A new access token will
     * be generated using a recent invalid access token. See Wiki for more info.
     *
     * @param {string} accessToken The old access token.
     * @param {string} clientToken The launcher's client token.
     * @param {boolean} requestUser Optional. Adds user object to the reponse.
     *
     * @see http://wiki.vg/Authentication#Refresh
     */
    static async refresh(accessToken, clientToken, requestUser = true) {
        try {
            const json = {
                accessToken,
                clientToken,
                requestUser
            };
            const res = await MojangRestAPI.authClient.post('refresh', { json, responseType: 'json' });
            MojangRestAPI.expectSpecificSuccess('Mojang Refresh', 200, res.statusCode);
            return {
                data: res.body,
                responseStatus: RestResponse_1.RestResponseStatus.SUCCESS
            };
        }
        catch (err) {
            return MojangRestAPI.handleGotError('Mojang Refresh', err, () => null);
        }
    }
}
exports.MojangRestAPI = MojangRestAPI;
MojangRestAPI.logger = LoggerUtil_1.LoggerUtil.getLogger('Mojang');
MojangRestAPI.TIMEOUT = 2500;
MojangRestAPI.AUTH_ENDPOINT = 'https://authserver.mojang.com';
MojangRestAPI.STATUS_ENDPOINT = 'https://mojang-status.herokuapp.com';
MojangRestAPI.authClient = got_1.default.extend({
    prefixUrl: MojangRestAPI.AUTH_ENDPOINT,
    responseType: 'json',
    retry: 0
});
MojangRestAPI.statusClient = got_1.default.extend({
    prefixUrl: MojangRestAPI.STATUS_ENDPOINT,
    responseType: 'json',
    retry: 0
});
MojangRestAPI.MINECRAFT_AGENT = {
    name: 'Minecraft',
    version: 1
};
MojangRestAPI.statuses = MojangRestAPI.getDefaultStatuses();
//# sourceMappingURL=MojangRestAPI.js.map
import { guardObject, GuardSignal, niceGuard, Validator } from "guard-object";
import { Scoped } from "./variables";
import { ERRORS } from "./values";
import { normalizeRoute } from "./utils";

export const useDDOS = (config, requestPath, route, req, ipNode) => {
    requestPath = normalizeRoute(requestPath);
    const ipAddress = typeof ipNode === 'function' ? ipNode(req) : req[ipNode || 'ip'];

    const tipConfig = config?.[route];
    if (tipConfig) {
        const rootValue = niceGuard(DDOS_guard, tipConfig) ? tipConfig : tipConfig?.[requestPath];
        if (rootValue) {
            const { calls, perSeconds } = rootValue;
            const accessPath = `${ipAddress}_${route}${requestPath}`;

            if (Scoped.DDOS_Verse[accessPath]) {
                if (++Scoped.DDOS_Verse[accessPath].calls > calls) {
                    throw ERRORS.TOO_MANY_REQUEST;
                }
            } else {
                Scoped.DDOS_Verse[accessPath] = {
                    calls: 1,
                    timer: setTimeout(() => {
                        clearTimeout(Scoped.DDOS_Verse[accessPath]?.timer);
                        if (Scoped.DDOS_Verse[accessPath]) delete Scoped.DDOS_Verse[accessPath];
                    }, perSeconds * 1000)
                };
            }
        }
    }
};

export const statusErrorCode = (e) => {
    const code = {
        [ERRORS.TOO_MANY_REQUEST.simpleError.error]: 429
    }[e?.simpleError?.error];

    return code || 403;
};

const ddos_steps = [
    ['auth', ['signup', 'signin', 'signout', 'refresh_token', 'google_signin']],
    ['database', ['read', 'query', 'write']],
    ['storage', ['get', 'upload', 'delete', 'delete_folder']],
    ['requests']
];

const DDOS_guard = {
    calls: GuardSignal.POSITIVE_INTEGER,
    perSeconds: GuardSignal.POSITIVE_INTEGER
};

export const validateDDOS_Config = (config) => {
    if (!Validator.OBJECT(config)) throw `expected an object for ddosMap but got ${config}`;
    guardObject({
        ...Object.fromEntries(
            ddos_steps.map(([k, v]) =>
                [k, k === 'requests' ? Validator.OBJECT(config?.requests) ? Object.keys(config.requests) : [] : v]
            ).map(([k, v]) =>
                [
                    k,
                    t => t === undefined ||
                        niceGuard(DDOS_guard, t) ||
                        guardObject(
                            Object.fromEntries(
                                v.map(r => [
                                    r,
                                    t => t === undefined ||
                                        niceGuard(DDOS_guard, t)
                                ])
                            )
                        ).validate(t)
                ]
            )
        )
    }).validate(config);
};
import { LoggerUtil } from '../../../util/LoggerUtil'
import got, { RequestError } from 'got'
import { RestResponseStatus, handleGotError, RestResponse } from '../../../common/rest/RestResponse'

export enum MinecraftStatusColor {
    RED = 'red',
    YELLOW = 'yellow',
    GREEN = 'green',
    GREY = 'grey'
}

export interface MinecraftStatus {

    service: string
    status: MinecraftStatusColor
    name: string
    essential: boolean

}

export class MinecraftRestAPI {

    private static readonly logger = LoggerUtil.getLogger('Minecraft')

    private static readonly TIMEOUT = 2500

    public static readonly STATUS_ENDPOINT = 'https://minecraft-status.minecraft.evopixel.ro'

    private static statusClient = got.extend({
        prefixUrl: MinecraftRestAPI.STATUS_ENDPOINT,
        responseType: 'json',
        retry: 0
    })

    protected static statuses: MinecraftStatus[] = MinecraftRestAPI.getDefaultStatuses()

    public static getDefaultStatuses(): MinecraftStatus[] {
        return [
            {
                service: 'session.minecraft.net',
                status: MinecraftStatusColor.GREY,
                name: 'Multiplayer Session Service',
                essential: true
            },
            {
                service: 'auth.xboxlive.com',
                status: MinecraftStatusColor.GREY,
                name: 'Xbox Live Auth Server',
                essential: true
            },
            {
                service: 'login.microsoftonline.com',
                status: MinecraftStatusColor.GREY,
                name: 'Microsoft 0Auth Server',
                essential: true
            },
            {
                service: 'textures.minecraft.net',
                status: MinecraftStatusColor.GREY,
                name: 'Minecraft Skins',
                essential: false
            },
            {
                service: 'api.minecraftservices.com',
                status: MinecraftStatusColor.GREY,
                name: 'Public API',
                essential: false
            },
            {
                service: 'minecraft.net',
                status: MinecraftStatusColor.GREY,
                name: 'Minecraft.net',
                essential: false
            }
        ]
    }

    /**
     * Converts a Minecraft status color to a hex value. Valid statuses
     * are 'green', 'yellow', 'red', and 'grey'. Grey is a custom status
     * to our project which represents an unknown status.
     */
    public static statusToHex(status: string): string {
        switch(status.toLowerCase()){
            case MinecraftStatusColor.GREEN:
                return '#a5c325'
            case MinecraftStatusColor.YELLOW:
                return '#eac918'
            case MinecraftStatusColor.RED:
                return '#c32625'
            case MinecraftStatusColor.GREY:
            default:
                return '#848484'
        }
    }

    /**
     * Utility function to report an unexpected success code. An unexpected
     * code may indicate an API change.
     * 
     * @param operation The operation name.
     * @param expected The expected response code.
     * @param actual The actual response code.
     */
    private static expectSpecificSuccess(operation: string, expected: number, actual: number): void {
        if(actual !== expected) {
            MinecraftRestAPI.logger.warn(`${operation} expected ${expected} response, recieved ${actual}.`)
        }
    }

    /**
     * Retrieves the status of Minecraft's services.
     * The response is condensed into a single object. Each service is
     * a key, where the value is an object containing a status and name
     * property.
     */
    public static async status(): Promise<RestResponse<MinecraftStatus[]>>{
        try {

            const res = await MinecraftRestAPI.statusClient.get<{[service: string]: MinecraftStatusColor}[]>('check')

            MinecraftRestAPI.expectSpecificSuccess('Minecraft Status', 200, res.statusCode)

            res.body.forEach(status => {
                const entry = Object.entries(status)[0]
                for(let i=0; i<MinecraftRestAPI.statuses.length; i++) {
                    if(MinecraftRestAPI.statuses[i].service === entry[0]) {
                        MinecraftRestAPI.statuses[i].status = entry[1]
                        break
                    }
                }
            })

            return {
                data: MinecraftRestAPI.statuses,
                responseStatus: RestResponseStatus.SUCCESS
            }

        } catch(error) {

            return handleGotError('Minecraft Status', error as RequestError, MinecraftRestAPI.logger, () => {
                for(let i=0; i<MinecraftRestAPI.statuses.length; i++){
                    MinecraftRestAPI.statuses[i].status = MinecraftStatusColor.GREY
                }
                return MinecraftRestAPI.statuses
            })
        }
        
    }
}
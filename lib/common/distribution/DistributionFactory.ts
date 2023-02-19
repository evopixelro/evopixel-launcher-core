import { Distribution, Server, Module, Type, Required as HeliosRequired } from 'helios-distribution-types'
import { MavenComponents, MavenUtil } from '../util/MavenUtil'
import { join } from 'path'
import { LoggerUtil } from '../../util/LoggerUtil'

const logger = LoggerUtil.getLogger('DistributionFactory')

export class HeliosDistribution {

    private mainServerIndex!: number

    public readonly servers: HeliosServer[]

    constructor(
        public readonly rawDistribution: Distribution
    ) {
        this.resolveMainServerIndex()
        this.servers = this.rawDistribution.servers.map(s => new HeliosServer(s))
    }

    private resolveMainServerIndex(): void {

        if(this.rawDistribution.servers.length > 0) {
            for(let i=0; i<this.rawDistribution.servers.length; i++) {
                if(this.mainServerIndex == null) {
                    if(this.rawDistribution.servers[i].mainServer) {
                        this.mainServerIndex = i
                    }
                } else {
                    this.rawDistribution.servers[i].mainServer = false
                }
            }
            if(this.mainServerIndex == null) {
                this.mainServerIndex = 0
                this.rawDistribution.servers[this.mainServerIndex].mainServer = true
            }
        } else {
            logger.warn('Distribution has 0 configured servers. This doesnt seem right..')
            this.mainServerIndex = 0
        }
    }

    public getMainServer(): HeliosServer | null {
        return this.mainServerIndex < this.servers.length ? this.servers[this.mainServerIndex] : null
    }

    public getServerById(id: string): HeliosServer | null {
        return this.servers.find(s => s.rawServer.id === id) || null
    }

}

export class HeliosServer {

    public readonly modules: HeliosModule[]
    public readonly hostname: string
    public readonly port: number

    constructor(
        public readonly rawServer: Server
    ) {
        const { hostname, port } = this.parseAddress()
        this.hostname = hostname
        this.port = port
        this.modules = rawServer.modules.map(m => new HeliosModule(m, rawServer.id))
    }

    private parseAddress(): { hostname: string, port: number } {
        // Srv record lookup here if needed.
        if(this.rawServer.address.includes(':')) {
            const pieces = this.rawServer.address.split(':')
            const port = Number(pieces[1])

            if(!Number.isInteger(port)) {
                throw new Error(`Malformed server address for ${this.rawServer.id}. Port must be an integer!`)
            }

            return { hostname: pieces[0], port }
        } else {
            return { hostname: this.rawServer.address, port: 25565 }
        }
    }

}

export class HeliosModule {

    public readonly subModules: HeliosModule[]

    private readonly mavenComponents: Readonly<MavenComponents>
    private readonly required: Readonly<Required<HeliosRequired>>
    private readonly localPath: string

    constructor(
        public readonly rawModule: Module,
        private readonly serverId: string
    ) {

        this.mavenComponents = this.resolveMavenComponents()
        this.required = this.resolveRequired()
        this.localPath = this.resolveLocalPath()

        if(this.rawModule.subModules != null) {
            this.subModules = this.rawModule.subModules.map(m => new HeliosModule(m, serverId))
        } else {
            this.subModules = []
        }
        
    }

    private resolveMavenComponents(): MavenComponents {

        // Files need not have a maven identifier if they provide a path.
        if(this.rawModule.type === Type.File && this.rawModule.artifact.path != null) {
            return null! as MavenComponents
        }
        // Version Manifests never provide a maven identifier.
        if(this.rawModule.type === Type.VersionManifest) {
            return null! as MavenComponents
        }

        const isMavenId = MavenUtil.isMavenIdentifier(this.rawModule.id)

        if(!isMavenId) {
            if(this.rawModule.type !== Type.File) {
                throw new Error(`Module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type} must have a valid maven identifier!`)
            } else {
                throw new Error(`Module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type} must either declare an artifact path or have a valid maven identifier!`)
            }
        }

        try {
            return MavenUtil.getMavenComponents(this.rawModule.id)
        } catch(err) {
            throw new Error(`Failed to resolve maven components for module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type}. Reason: ${(err as Error).message}`)
        }
        
    }

    private resolveRequired(): Required<HeliosRequired> {
        if(this.rawModule.required == null) {
            return {
                value: true,
                def: true
            }
        } else {
            return {
                value: this.rawModule.required.value ?? true,
                def: this.rawModule.required.def ?? true
            }
        }
    }

    private resolveLocalPath(): string {

        // Version Manifests have a pre-determined path.
        if(this.rawModule.type === Type.VersionManifest) {
            return join('TODO_COMMON_DIR', 'versions', this.rawModule.id, `${this.rawModule.id}.json`)
        }

        const relativePath = this.rawModule.artifact.path ?? MavenUtil.mavenComponentsAsNormalizedPath(
            this.mavenComponents.group,
            this.mavenComponents.artifact,
            this.mavenComponents.version,
            this.mavenComponents.classifier,
            this.mavenComponents.extension
        )

        switch (this.rawModule.type) {
            case Type.Library:
            case Type.Forge:
            case Type.ForgeHosted:
            case Type.LiteLoader:
                return join('TODO_COMMON_DIR', 'libraries', relativePath)
            case Type.ForgeMod:
            case Type.LiteMod:
                return join('TODO_COMMON_DIR', 'modstore', relativePath)
            case Type.File:
            default:
                return join('TODO_INSTANCE_DIR', this.serverId, relativePath) 
        }
        
    }

    public hasMavenComponents(): boolean {
        return this.mavenComponents != null
    }

    public getMavenComponents(): Readonly<MavenComponents> {
        return this.mavenComponents
    }

    public getRequired(): Readonly<Required<HeliosRequired>> {
        return this.required
    }

    public getPath(): string {
        return this.localPath
    }

    public getMavenIdentifier(): string {
        return MavenUtil.mavenComponentsToIdentifier(
            this.mavenComponents.group,
            this.mavenComponents.artifact,
            this.mavenComponents.version,
            this.mavenComponents.classifier,
            this.mavenComponents.extension
        )
    }

    public getExtensionlessMavenIdentifier(): string {
        return MavenUtil.mavenComponentsToExtensionlessIdentifier(
            this.mavenComponents.group,
            this.mavenComponents.artifact,
            this.mavenComponents.version,
            this.mavenComponents.classifier
        )
    }

    public getVersionlessMavenIdentifier(): string {
        return MavenUtil.mavenComponentsToVersionlessIdentifier(
            this.mavenComponents.group,
            this.mavenComponents.artifact
        )
    }

    public hasSubModules(): boolean {
        return this.subModules.length > 0
    }

}
import * as path from "path";
import { Project } from "ts-morph";

export class AuthHelperGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generate(outputDir: string): void {
        const authDir = path.join(outputDir, "auth");
        const filePath = path.join(authDir, "auth-helper.service.ts");
        const sourceFile = this.project.createSourceFile(filePath, this.getAuthHelperServiceTemplate(), { overwrite: true });
        sourceFile.formatText();
        sourceFile.saveSync();
    }

    private getAuthHelperServiceTemplate(): string {
        // This template provides a ready-to-use wrapper around angular-oauth2-oidc
        return `
        import { Injectable, inject } from '@angular/core';
        import { Router } from '@angular/router';
        import { OAuthService } from 'angular-oauth2-oidc';
        import { filter } from 'rxjs';

        @Injectable({ providedIn: 'root' })
        export class AuthHelperService {
            private readonly oAuthService = inject(OAuthService);
            private readonly router = inject(Router);

            /**
             * The stream of authentication events.
             */
            public events$ = this.oAuthService.events;
            
            /**
             * A stream that emits true if the user is authenticated, otherwise false.
             */
            public isAuthenticated$ = this.events$.pipe(filter(e => e.type === 'token_received'));
            
            /**
             * A stream that emits the user's identity claims when authenticated.
             */
            public identityClaims$ = this.oAuthService.identityClaims$;

            /**
             * Configures the OAuth service and initiates the login flow.
             * Should be called in your app initializer.
             */
            public async configure(): Promise<void> {
                await this.oAuthService.loadDiscoveryDocumentAndTryLogin();
            }

            public login(redirectUrl?: string): void {
                this.oAuthService.initCodeFlow(redirectUrl);
            }

            public logout(): void {
                this.oAuthService.logOut();
                this.router.navigate(['/']);
            }

            public getAccessToken(): string {
                return this.oAuthService.getAccessToken();
            }

            public getIdentityClaims(): object | null {
                return this.oAuthService.getIdentityClaims();
            }
        }`;
    }
}

import { Elysia, t } from 'elysia';

const app = new Elysia();
const DISCORD_WEBHOOK_URL = Bun.env.DISCORD_WEBHOOK_URL || '';
const PORT = Number(Bun.env.POR0T) || 3000;

app.get('/api/version', async () => {
    return '1.0.0';
});

app.post('/webhook', async ({ body }) => {
    const { object_kind, object_attributes, user, project, commit, builds } = body;

    if (object_kind === 'pipeline') {
        const pipelineStatus = object_attributes.status;
        const ref = object_attributes.ref;
        const pipelineUrl = object_attributes.url;
        const commitMessage = commit.message;
        const commitUrl = commit.url;

        // Checkmark or cross based on status
        const statusEmoji = (status: string) => {
            if (status === 'success') return '✅';
            if (status === 'failed') return '❌';
            if (status === 'skipped') return '⏭️'; // Symbol for skipped
            return '⚠️';
        };

        // Filter stages to only include build, migrate, and deploy
        const relevantStages = ['build', 'migrate', 'deploy'];

        // Group builds by stage
        const groupedBuilds = builds
            .filter(build => relevantStages.includes(build.stage))
            .reduce((acc, build) => {
                acc[build.stage] = acc[build.stage] || [];
                acc[build.stage].push(build);
                return acc;
            }, {} as Record<string, typeof builds>);

        // Format the grouped builds
        const buildStatuses = Object.entries(groupedBuilds)
            .map(([stage, builds]) => {
                const buildsFormatted = builds.map(build => {
                    return `${statusEmoji(build.status)} **Name:** ${build.name}`;
                }).join('\n');
                return `**Stage: ${stage}**\n${buildsFormatted}`;
            })
            .join('\n\n'); // Add double new line between stages

        const message = `**Pipeline ${pipelineStatus.toUpperCase()}**\n` +
                        `**Project:** ${project.name}\n` +
                        `**Branch:** ${ref}\n` +
                        `**User:** ${user.name}\n` +
                        `**Commit:** [${commitMessage}](${commitUrl})\n\n` +
                        `**Pipeline URL:** [View Pipeline](${pipelineUrl})\n\n` +
                        `**Build Statuses:**\n${buildStatuses}`;

        await notifyDiscord(message);
    }

    return 'OK';
}, {
    body: t.Object({
        object_kind: t.String(),
        object_attributes: t.Object({
            status: t.String(),
            ref: t.String(),
            url: t.String(),
        }),
        user: t.Object({
            name: t.String(),
        }),
        project: t.Object({
            name: t.String(),
        }),
        commit: t.Object({
            message: t.String(),
            url: t.String(),
        }),
        builds: t.Array(t.Object({
            stage: t.String(),
            name: t.String(),
            status: t.String(),
        }))
    })
});

const notifyDiscord = async (message: string) => {
    const webhookUrl = DISCORD_WEBHOOK_URL;
    const chunks = message.match(/.{1,2000}/gs);

    if (!chunks) {
        return;
    }

    for (const chunk of chunks) {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: chunk,
            }),
        });
    }
};

app.listen(PORT, () => {
    console.info(`Elysia server is running at port ${PORT}`);
});

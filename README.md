# Automated Cloud Run

A dependency-free Node.js service with Docker, Cloud Build, and Cloud Run deployment automation.

## Run Locally

```powershell
node server.js
```

Open `http://localhost:8080` or `http://localhost:8080/healthz`.

## Test

```powershell
node test.js
```

## Deploy

Install the Google Cloud CLI, authenticate, then run:

```powershell
gcloud auth login
.\deploy.ps1 -ProjectId "your-gcp-project-id"
```

Optional deployment settings:

```powershell
.\deploy.ps1 -ProjectId "your-gcp-project-id" -ServiceName "my-service" -Region "us-central1"
```

The deployment uses `cloudbuild.yaml` to build the container, push it to Artifact Registry, and deploy it to Cloud Run.

## Check History

Each website check is saved locally to `runs.json` so the dashboard can reload recent results after a local restart. Cloud Run's container filesystem is temporary, so use Firestore or another database for permanent deployed history.

## Automated GitHub Deploys

The workflow in `.github/workflows/deploy-cloud-run.yml` deploys to Cloud Run on every push to `main`.

Add these repository secrets:

- `GCP_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

The Google service account should have permission to deploy Cloud Run services and act as the runtime service account.

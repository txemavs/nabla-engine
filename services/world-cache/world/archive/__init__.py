"""Optional copy of the published map in S3.

Off unless `ATLAS_BUCKET` and AWS credentials are set. Installations read cells
that already exist and upload a cell only when that key is still absent.
"""

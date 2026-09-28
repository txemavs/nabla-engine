"""Requests waiting to become cells.

One SQLite table, `planet_jobs`. A row is a Web Mercator address
(`z/zoom/x/y`) plus a state: queued, running, ready or failed.
"""

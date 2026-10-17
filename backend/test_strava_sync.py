from contextlib import closing
import json
import os
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs
from xml.etree import ElementTree

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
import main


class StravaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db, self.old_upload = main.DB, main.UPLOAD_DIR
        main.DB = os.path.join(self.temp.name, 'test.db')
        main.UPLOAD_DIR = os.path.join(self.temp.name, 'photos')
        self.env = patch.dict(os.environ, {'STRAVA_CLIENT_ID': '123', 'STRAVA_CLIENT_SECRET': 'secret', 'STRAVA_TOKEN_KEY': Fernet.generate_key().decode()})
        self.env.start()
        main.init_db()
        self.client = TestClient(main.app)
        self.token = self.client.post('/api/auth/register', json={'username': 'runner', 'password': 'testpass'}).json()['token']
        self.headers = {'Authorization': 'Bearer ' + self.token}
        self.samples = [{'lat': 25, 'lng': 121, 'ts': 1792195200000, 'segment': 0}, {'lat': 25.001, 'lng': 121, 'ts': 1792195260000, 'segment': 1}]

    def tearDown(self):
        self.env.stop()
        main.DB, main.UPLOAD_DIR = self.old_db, self.old_upload
        self.temp.cleanup()

    def token_data(self):
        return {'access_token': 'access', 'refresh_token': 'refresh', 'expires_at': 9999999999, 'athlete': {'id': 9}, 'scope': 'activity:write'}

    def activity(self, samples=None):
        return self.client.post('/api/activities', headers=self.headers, json={'type': 'run', 'distance_m': 100, 'duration_s': 60, 'start_ts': self.samples[0]['ts'], 'end_ts': self.samples[-1]['ts'], 'route_samples': samples or []}).json()['id']

    def test_oauth_single_use_encryption_and_scope(self):
        response = self.client.post('/api/strava/connect', headers=self.headers)
        state = parse_qs(urlparse(response.json()['url']).query)['state'][0]
        with patch('strava_sync.remote', return_value=self.token_data()) as remote:
            result = self.client.get('/api/strava/callback', params={'state': state, 'code': 'code'}, follow_redirects=False)
            self.assertIn('strava=connected', result.headers['location'])
            self.client.get('/api/strava/callback', params={'state': state, 'code': 'code'}, follow_redirects=False)
            self.assertEqual(remote.call_count, 1)
        with closing(main.get_conn()) as db:
            encrypted = db.execute('SELECT tokens FROM strava_connections').fetchone()[0]
        self.assertNotIn('access', encrypted)
        self.assertNotIn('refresh', encrypted)
        state = parse_qs(urlparse(self.client.post('/api/strava/connect', headers=self.headers).json()['url']).query)['state'][0]
        token = self.token_data(); token['scope'] = 'read'
        with patch('strava_sync.remote', return_value=token):
            result = self.client.get('/api/strava/callback', params={'state': state, 'code': 'code', 'scope': 'activity:write'}, follow_redirects=False)
            self.assertIn('strava=failed', result.headers['location'])

    def test_new_activity_upload_poll_and_retry_do_not_duplicate(self):
        main.strava.store_token(1, self.token_data(), 9)
        with patch('strava_sync.remote', side_effect=[{'id': 22, 'activity_id': None}, {'id': 22, 'activity_id': 33}]) as remote:
            aid = self.activity(self.samples)
            self.assertEqual(self.client.get(f'/api/activities/{aid}/strava', headers=self.headers).json()['status'], 'processing')
            self.assertEqual(self.client.post(f'/api/activities/{aid}/strava', headers=self.headers).json()['status'], 'synced')
            self.client.post(f'/api/activities/{aid}/strava', headers=self.headers)
            self.assertEqual([x.args[0] for x in remote.call_args_list], ['POST', 'GET'])
            xml = remote.call_args_list[0].kwargs['files']['file'][1]
            root = ElementTree.fromstring(xml)
            ns = {'g': 'http://www.topografix.com/GPX/1/1'}
            self.assertEqual(len(root.findall('.//g:trkseg', ns)), 2)
            self.assertEqual(len(root.findall('.//g:time', ns)), 2)

    def test_refresh_failure_isolated_and_legacy_route_not_fabricated(self):
        data = self.token_data(); data['expires_at'] = 0
        main.strava.store_token(1, data, 9)
        with patch('strava_sync.remote', side_effect=[self.token_data(), ValueError('Strava 流量限制，請稍後重試')]) as remote:
            aid = self.activity(self.samples)
            self.assertEqual(self.client.get(f'/api/activities/{aid}', headers=self.headers).status_code, 200)
            self.assertEqual(main.strava.result(aid)['status'], 'failed')
            self.assertEqual(remote.call_args_list[0].kwargs['data']['grant_type'], 'refresh_token')
        with patch('strava_sync.remote') as remote:
            aid = self.activity()
            self.assertEqual(main.strava.result(aid)['status'], 'failed')
            remote.assert_not_called()

    def test_ownership_auth_and_disconnect(self):
        aid = self.activity(self.samples)
        self.assertEqual(self.client.post(f'/api/activities/{aid}/strava').status_code, 401)
        token = self.client.post('/api/auth/register', json={'username': 'other', 'password': 'testpass'}).json()['token']
        self.assertEqual(self.client.post(f'/api/activities/{aid}/strava', headers={'Authorization': 'Bearer ' + token}).status_code, 404)
        main.strava.store_token(1, self.token_data(), 9)
        self.client.delete('/api/strava/connection', headers=self.headers)
        with patch('strava_sync.remote') as remote:
            self.activity(self.samples)
            remote.assert_not_called()


if __name__ == '__main__':
    unittest.main()

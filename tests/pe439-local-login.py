"""Run existing isolated login fixture and exact legacy cases; no device or cloud.
Usage: PS_BACKEND_PATH=../backend python3 tests/pe439-local-login.py
"""
import hashlib
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

backend = Path(os.environ.get('PS_BACKEND_PATH', '../backend')).resolve()
source = backend / 'ps-device/app/wifi/tests/test_wifi_setup.py'
spec = importlib.util.spec_from_file_location('existing_wifi_tests', source)
existing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(existing)

class CredentialCompatibility(existing.Base):
    def test_current_known_representations_login(self):
        self.c.config.update(credential_scheme='numeric10-admin10-v1', code_sha256=hashlib.sha256(b'ABCDE23456').hexdigest())
        before = dict(self.c.config)
        for value in ['ABCDE23456', 'abcde-23456', 'ABCD-E234-56']:
            self.assertTrue(self.c.login(value))
        self.assertEqual(self.c.config, before)

    def test_legacy_mixed_case_and_misleading_hyphens_login_exactly(self):
        for value in ['LeGa-cY-9!', 'AB-CDE23456']:
            self.c.attempts = []
            self.c.config.pop('credential_scheme', None)
            self.c.config['code_sha256'] = hashlib.sha256(value.encode()).hexdigest()
            before = dict(self.c.config)
            self.assertTrue(self.c.login(value))
            with self.assertRaises(ValueError):
                self.c.login(value.replace('-', '').upper())
            self.assertEqual(self.c.config, before)

# Existing fixture's ephemeral listener is restricted to an authorized test port.
server_init = existing.m.SetupServer.__init__
def test_server_init(server, address, handler):
    server_init(server, ('127.0.0.1', 18798), handler)
suite = unittest.TestSuite([
    existing.HttpSecurity('test_new_admin_code_accepts_grouping_and_case'),
    CredentialCompatibility('test_current_known_representations_login'),
    CredentialCompatibility('test_legacy_mixed_case_and_misleading_hyphens_login_exactly'),
])
with patch.object(existing.m.SetupServer, '__init__', test_server_init):
    result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)

import unittest
from bridge import Protocol


class ProtocolTests(unittest.TestCase):
    def test_authentication_limits_and_watchdog(self):
        p = Protocol('test-token')
        with self.assertRaises(ValueError):
            p.receive('{"type":"force","force":1}', 1)
        with self.assertRaises(ValueError):
            p.receive('{"type":"authenticate","token":"wrong"}', 1)
        self.assertIsNone(p.receive('{"type":"authenticate","token":"test-token"}', 1))
        self.assertAlmostEqual(p.receive('{"type":"force","force":1}', 1.1), 0.3)
        self.assertAlmostEqual(p.receive('{"type":"force","force":-1}', 1.1), -0.3)
        self.assertFalse(p.expired(1.2))
        self.assertTrue(p.expired(1.3))

    def test_rejects_invalid_outputs(self):
        p = Protocol('t')
        p.receive('{"type":"authenticate","token":"t"}', 1)
        for value in ['NaN', 'Infinity', 'true', 'null', '"1"']:
            with self.assertRaises(ValueError):
                p.receive('{"type":"force","force":' + value + '}', 2)


if __name__ == '__main__':
    unittest.main()

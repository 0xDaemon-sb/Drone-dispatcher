import type { MigrationInterface, QueryRunner } from "typeorm";

const oldImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const fixtures = [
  { id: "00000000-0000-4000-9000-000000000001", image: "https://example.com/medications/paracetamol.png" },
  { id: "00000000-0000-4000-9000-000000000002", image: "https://example.com/medications/amoxicillin.png" },
  { id: "00000000-0000-4000-9000-000000000003", image: "https://example.com/medications/vitamin-c.png" },
];

export class MedicationImageUrls1792627201000 implements MigrationInterface {
  name = "MedicationImageUrls1792627201000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const fixture of fixtures) {
      await queryRunner.query(
        'UPDATE "medications" SET "image" = $1 WHERE "id" = $2 AND "image" = $3',
        [fixture.image, fixture.id, oldImage],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const fixture of fixtures) {
      await queryRunner.query(
        'UPDATE "medications" SET "image" = $1 WHERE "id" = $2 AND "image" = $3',
        [oldImage, fixture.id, fixture.image],
      );
    }
  }
}

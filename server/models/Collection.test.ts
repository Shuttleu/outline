import randomstring from "randomstring";
import { v4 as uuidv4 } from "uuid";
import slugify from "@shared/utils/slugify";
import {
  buildUser,
  buildGroup,
  buildCollection,
  buildTeam,
  buildDocument,
} from "@server/test/factories";
import Collection from "./Collection";
import Document from "./Document";

beforeEach(() => {
  jest.resetAllMocks();
});

describe("#url", () => {
  test("should return correct url for the collection", () => {
    const collection = new Collection({
      id: "1234",
    });
    expect(collection.url).toBe(`/collection/untitled-${collection.urlId}`);
  });
});

describe("getDocumentParents", () => {
  test("should return array of parent document ids", async () => {
    const parent = await buildDocument();
    const document = await buildDocument();
    const collection = await buildCollection({
      documentStructure: [
        {
          ...(await parent.toNavigationNode()),
          children: [await document.toNavigationNode()],
        },
      ],
    });
    const result = collection.getDocumentParents(document.id);
    expect(result?.length).toBe(1);
    expect(result[0]).toBe(parent.id);
  });

  test("should return array of parent document ids", async () => {
    const parent = await buildDocument();
    const document = await buildDocument();
    const collection = await buildCollection({
      documentStructure: [
        {
          ...(await parent.toNavigationNode()),
          children: [await document.toNavigationNode()],
        },
      ],
    });
    const result = collection.getDocumentParents(parent.id);
    expect(result?.length).toBe(0);
  });

  test("should not error if documentStructure is empty", async () => {
    const parent = await buildDocument();
    await buildDocument();
    const collection = await buildCollection();
    const result = collection.getDocumentParents(parent.id);
    expect(result).toBe(undefined);
  });
});

describe("getDocumentTree", () => {
  test("should return document tree", async () => {
    const document = await buildDocument();
    const collection = await buildCollection({
      documentStructure: [await document.toNavigationNode()],
    });
    expect(collection.getDocumentTree(document.id)).toEqual(
      await document.toNavigationNode()
    );
  });

  test("should return nested documents in tree", async () => {
    const parent = await buildDocument();
    const document = await buildDocument();
    const collection = await buildCollection({
      documentStructure: [
        {
          ...(await parent.toNavigationNode()),
          children: [await document.toNavigationNode()],
        },
      ],
    });

    expect(collection.getDocumentTree(parent.id)).toEqual({
      ...(await parent.toNavigationNode()),
      children: [await document.toNavigationNode()],
    });
    expect(collection.getDocumentTree(document.id)).toEqual(
      await document.toNavigationNode()
    );
  });
});

describe("#addDocumentToStructure", () => {
  test("should add as last element without index", async () => {
    const collection = await buildCollection();
    const id = uuidv4();
    const newDocument = await buildDocument({
      id,
      title: "New end node",
      parentDocumentId: null,
      teamId: collection.teamId,
    });
    await collection.addDocumentToStructure(newDocument);
    expect(collection.documentStructure!.length).toBe(1);
    expect(collection.documentStructure![0].id).toBe(id);

    // should not append multiple times
    await collection.addDocumentToStructure(newDocument);
    expect(collection.documentStructure!.length).toBe(1);
  });

  test("should add with an index", async () => {
    const collection = await buildCollection();
    const id = uuidv4();
    const newDocument = await buildDocument({
      id,
      title: "New end node",
      parentDocumentId: null,
      teamId: collection.teamId,
    });
    await collection.addDocumentToStructure(newDocument, 1);
    expect(collection.documentStructure!.length).toBe(1);
    expect(collection.documentStructure![0].id).toBe(id);
  });

  test("should add as a child if with parent", async () => {
    const collection = await buildCollection();
    const document = await buildDocument({ collectionId: collection.id });
    await collection.reload();

    const id = uuidv4();
    const newDocument = await buildDocument({
      id,
      title: "New end node",
      parentDocumentId: document.id,
      teamId: collection.teamId,
    });
    await collection.addDocumentToStructure(newDocument, 1);
    expect(collection.documentStructure!.length).toBe(1);
    expect(collection.documentStructure![0].id).toBe(document.id);
    expect(collection.documentStructure![0].children.length).toBe(1);
    expect(collection.documentStructure![0].children[0].id).toBe(id);
  });

  test("should add as a child if with parent with index", async () => {
    const collection = await buildCollection();
    const document = await buildDocument({ collectionId: collection.id });
    await collection.reload();

    const newDocument = await buildDocument({
      id: uuidv4(),
      title: "node",
      parentDocumentId: document.id,
      teamId: collection.teamId,
    });
    const id = uuidv4();
    const secondDocument = await buildDocument({
      id,
      title: "New start node",
      parentDocumentId: document.id,
      teamId: collection.teamId,
    });
    await collection.addDocumentToStructure(newDocument);
    await collection.addDocumentToStructure(secondDocument, 0);
    expect(collection.documentStructure!.length).toBe(1);
    expect(collection.documentStructure![0].id).toBe(document.id);
    expect(collection.documentStructure![0].children.length).toBe(2);
    expect(collection.documentStructure![0].children[0].id).toBe(id);
  });
  describe("options: documentJson", () => {
    test("should append supplied json over document's own", async () => {
      const collection = await buildCollection();
      const id = uuidv4();
      const newDocument = await buildDocument({
        id: uuidv4(),
        title: "New end node",
        parentDocumentId: null,
        teamId: collection.teamId,
      });
      await collection.addDocumentToStructure(newDocument, undefined, {
        documentJson: {
          id,
          title: "Parent",
          url: "parent",
          children: [
            {
              id,
              title: "Totally fake",
              children: [],
              url: "totally-fake",
            },
          ],
        },
      });
      expect(collection.documentStructure![0].children.length).toBe(1);
      expect(collection.documentStructure![0].children[0].id).toBe(id);
    });
  });
});

describe("#updateDocument", () => {
  test("should update root document's data", async () => {
    const collection = await buildCollection();
    const document = await buildDocument({ collectionId: collection.id });
    await collection.reload();

    document.title = "Updated title";
    await document.save();
    await collection.updateDocument(document);
    expect(collection.documentStructure![0].title).toBe("Updated title");
  });

  test("should update child document's data", async () => {
    const collection = await buildCollection();
    const document = await buildDocument({ collectionId: collection.id });
    await collection.reload();

    const newDocument = await Document.create({
      parentDocumentId: document.id,
      collectionId: collection.id,
      teamId: collection.teamId,
      userId: collection.createdById,
      lastModifiedById: collection.createdById,
      createdById: collection.createdById,
      title: "Child document",
      text: "content",
    });
    await collection.addDocumentToStructure(newDocument);
    newDocument.title = "Updated title";
    await newDocument.save();
    await collection.updateDocument(newDocument);
    const reloaded = await Collection.findByPk(collection.id);
    expect(reloaded!.documentStructure![0].children[0].title).toBe(
      "Updated title"
    );
  });
});

describe("#removeDocument", () => {
  test("should save if removing", async () => {
    const collection = await buildCollection();
    const document = await buildDocument({ collectionId: collection.id });
    await collection.reload();

    jest.spyOn(collection, "save");
    await collection.deleteDocument(document);
    expect(collection.save).toBeCalled();
  });

  test("should remove documents from root", async () => {
    const collection = await buildCollection();
    const document = await buildDocument({ collectionId: collection.id });
    await collection.reload();

    await collection.deleteDocument(document);
    expect(collection.documentStructure!.length).toBe(0);
    // Verify that the document was removed
    const collectionDocuments = await Document.findAndCountAll({
      where: {
        collectionId: collection.id,
      },
    });
    expect(collectionDocuments.count).toBe(0);
  });

  test("should remove a document with child documents", async () => {
    const collection = await buildCollection();
    const document = await buildDocument({ collectionId: collection.id });
    await collection.reload();

    // Add a child for testing
    const newDocument = await Document.create({
      parentDocumentId: document.id,
      collectionId: collection.id,
      teamId: collection.teamId,
      userId: collection.createdById,
      lastModifiedById: collection.createdById,
      createdById: collection.createdById,
      title: "Child document",
      text: "content",
    });
    await collection.addDocumentToStructure(newDocument);
    expect(collection.documentStructure![0].children.length).toBe(1);
    // Remove the document
    await collection.deleteDocument(document);
    expect(collection.documentStructure!.length).toBe(0);
    const collectionDocuments = await Document.findAndCountAll({
      where: {
        collectionId: collection.id,
      },
    });
    expect(collectionDocuments.count).toBe(0);
  });

  test("should remove a child document", async () => {
    const collection = await buildCollection();
    const document = await buildDocument({ collectionId: collection.id });
    await collection.reload();

    // Add a child for testing
    const newDocument = await Document.create({
      parentDocumentId: document.id,
      collectionId: collection.id,
      teamId: collection.teamId,
      userId: collection.createdById,
      lastModifiedById: collection.createdById,
      createdById: collection.createdById,
      publishedAt: new Date(),
      title: "Child document",
      text: "content",
    });
    await collection.addDocumentToStructure(newDocument);
    expect(collection.documentStructure!.length).toBe(1);
    expect(collection.documentStructure![0].children.length).toBe(1);
    // Remove the document
    await collection.deleteDocument(newDocument);
    const reloaded = await Collection.findByPk(collection.id);
    expect(reloaded!.documentStructure!.length).toBe(1);
    expect(reloaded!.documentStructure![0].children.length).toBe(0);
    const collectionDocuments = await Document.findAndCountAll({
      where: {
        collectionId: collection.id,
      },
    });
    expect(collectionDocuments.count).toBe(1);
  });
});

describe("#membershipUserIds", () => {
  test("should return collection and group memberships", async () => {
    const team = await buildTeam();
    const teamId = team.id;
    // Make 6 users
    const users = await Promise.all(
      Array(6)
        .fill(undefined)
        .map(() =>
          buildUser({
            teamId,
          })
        )
    );
    const collection = await buildCollection({
      userId: users[0].id,
      permission: null,
      teamId,
    });
    const group1 = await buildGroup({
      teamId,
    });
    const group2 = await buildGroup({
      teamId,
    });
    const createdById = users[0].id;
    await group1.$add("user", users[0], {
      through: {
        createdById,
      },
    });
    await group1.$add("user", users[1], {
      through: {
        createdById,
      },
    });
    await group2.$add("user", users[2], {
      through: {
        createdById,
      },
    });
    await group2.$add("user", users[3], {
      through: {
        createdById,
      },
    });
    await collection.$add("user", users[4], {
      through: {
        createdById,
      },
    });
    await collection.$add("user", users[5], {
      through: {
        createdById,
      },
    });
    await collection.$add("group", group1, {
      through: {
        createdById,
      },
    });
    await collection.$add("group", group2, {
      through: {
        createdById,
      },
    });
    const membershipUserIds = await Collection.membershipUserIds(collection.id);
    expect(membershipUserIds.length).toBe(6);
  });
});

describe("#findByPk", () => {
  test("should return collection with collection Id", async () => {
    const collection = await buildCollection();
    const response = await Collection.findByPk(collection.id);
    expect(response!.id).toBe(collection.id);
  });

  test("should return collection when urlId is present", async () => {
    const collection = await buildCollection();
    const id = `${slugify(collection.name)}-${collection.urlId}`;
    const response = await Collection.findByPk(id);
    expect(response!.id).toBe(collection.id);
  });

  test("should return collection when urlId is present, but missing slug", async () => {
    const collection = await buildCollection();
    const id = collection.urlId;
    const response = await Collection.findByPk(id);
    expect(response!.id).toBe(collection.id);
  });

  test("should return null when incorrect uuid type", async () => {
    const collection = await buildCollection();
    const response = await Collection.findByPk(collection.id + "-incorrect");
    expect(response).toBe(null);
  });

  test("should return null when incorrect urlId length", async () => {
    const collection = await buildCollection();
    const id = `${slugify(collection.name)}-${collection.urlId}incorrect`;
    const response = await Collection.findByPk(id);
    expect(response).toBe(null);
  });

  test("should return null when no collection is found with uuid", async () => {
    const response = await Collection.findByPk(
      "a9e71a81-7342-4ea3-9889-9b9cc8f667da"
    );
    expect(response).toBe(null);
  });

  test("should return null when no collection is found with urlId", async () => {
    const id = `${slugify("test collection")}-${randomstring.generate(15)}`;
    const response = await Collection.findByPk(id);
    expect(response).toBe(null);
  });
});
